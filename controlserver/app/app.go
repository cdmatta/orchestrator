package app

import (
	"bufio"
	"context"
	"controlserver/logger"
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/expvar"
	"github.com/gin-contrib/pprof"
	size "github.com/gin-contrib/size"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type ControlServer struct {
}

func New() *ControlServer {
	return &ControlServer{}
}

//go:embed frontend/dist
var frontendAssets embed.FS

func (cs *ControlServer) staticFilesEngine() *gin.Engine {
	eng := gin.New()
	eng.Use(gin.Recovery())

	fsys := fs.FS(frontendAssets)
	contentStatic, err := fs.Sub(fsys, "frontend/dist")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load frontend assets")
	}
	eng.StaticFS("/", http.FS(contentStatic))

	eng.NoRoute(func(c *gin.Context) {
		c.Redirect(http.StatusFound, "/")
		c.Abort()
	})

	return eng
}

func (cs *ControlServer) apiEngine() *gin.Engine {
	eng := gin.New()
	eng.Use(logger.GinLoggerMiddleware(), gin.Recovery())
	eng.Use(size.RequestSizeLimiter(1 * 1024 * 1024)) // Limit request body to 1MB

	rg := eng.Group("/api")
	cs.addDebugEndpoints(rg) // ignore these endpoints in UI
	rg.GET("/logs/download", fileDownloadHandler(logger.ControlServerLogFilePath))
	rg.GET("/logs/tail", createFileTailHandler(logger.ControlServerLogFilePath))
	rg.POST("/logs/truncate", logFileTruncateHandler(logger.ControlServerLogFilePath))
	rg.GET("/status", cs.handleStatus)

	return eng
}

func (cs *ControlServer) addDebugEndpoints(apiG *gin.RouterGroup) {
	rg := apiG.Group("/debug")
	rg.GET("/vars", expvar.Handler())
	pprof.Register(rg, "/pprof")
}

func fileDownloadHandler(filePath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filepath.Base(filePath)))
		c.Header("Content-Type", "application/octet-stream")

		file, err := os.Open(filePath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("error opening file: %v", err)})
			return
		}
		defer file.Close()

		if _, err := io.Copy(c.Writer, file); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("error reading file: %v", err)})
			return
		}
	}
}

func createFileTailHandler(filePath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("Transfer-Encoding", "chunked")

		currentFile, reader, err := openLogFile(filePath)
		if err != nil {
			c.SSEvent("error", fmt.Sprintf("error opening log file: %v", err))
			c.AbortWithError(http.StatusInternalServerError, err)
			return
		}
		defer currentFile.Close()

		watcher, err := setupFileWatcher(filePath)
		if err != nil {
			c.SSEvent("error", fmt.Sprintf("error creating file watcher: %v", err))
			c.AbortWithError(http.StatusInternalServerError, err)
			return
		}
		defer watcher.Close()

		for {
			select {
			case <-c.Request.Context().Done():
				return
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}

				if event.Op&(fsnotify.Write|fsnotify.Create) != 0 {
					// Check for truncation
					stat, err := currentFile.Stat()
					if err == nil {
						offset, _ := currentFile.Seek(0, io.SeekCurrent)
						if stat.Size() < offset {
							// File was truncated, seek to start
							currentFile.Seek(0, io.SeekStart)
							reader = bufio.NewReader(currentFile)
						}
					}
					for {
						line, err := reader.ReadString('\n')
						if err == nil {
							c.SSEvent("log", line)
							c.Writer.Flush()
						} else if err == io.EOF {
							break
						} else {
							c.SSEvent("error", fmt.Sprintf("error reading log file: %v", err))
							c.AbortWithError(http.StatusInternalServerError, err)
							return
						}
					}
				}

				if event.Op&(fsnotify.Remove|fsnotify.Rename) != 0 {
					currentFile.Close()
					watcher.Remove(filePath)

					currentFile, reader, err = openLogFile(filePath)
					if err != nil {
						c.SSEvent("error", fmt.Sprintf("error reopening log file: %v", err))
						c.AbortWithError(http.StatusInternalServerError, err)
						return
					}

					if err := watcher.Add(filePath); err != nil {
						c.SSEvent("error", fmt.Sprintf("error re-adding file watcher: %v", err))
						c.AbortWithError(http.StatusInternalServerError, err)
						return
					}
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				c.SSEvent("error", fmt.Sprintf("file watcher error: %v", err))
				c.AbortWithError(http.StatusInternalServerError, err)
				return
			}
		}
	}
}

func openLogFile(filePath string) (*os.File, *bufio.Reader, error) {
	currentFile, err := os.Open(filePath)
	if err != nil {
		return nil, nil, err
	}
	reader := bufio.NewReader(currentFile)
	_, err = currentFile.Seek(0, io.SeekEnd)
	if err != nil {
		currentFile.Close()
		return nil, nil, err
	}
	return currentFile, reader, nil
}

func setupFileWatcher(filePath string) (*fsnotify.Watcher, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	if err := watcher.Add(filePath); err != nil {
		watcher.Close()
		return nil, err
	}
	return watcher, nil
}

func logFileTruncateHandler(filePath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := logger.ResetLogFile(filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("error wiping log file: %v", err)})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Log file %s wiped successfully", filePath)})
	}
}

func (cs *ControlServer) handleStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"hello": "world",
	})
}

func (cs *ControlServer) setupRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	api := cs.apiEngine()
	static := cs.staticFilesEngine()

	r := gin.New()
	r.SetTrustedProxies([]string{"0.0.0.0"})
	r.Use(gin.Recovery())
	r.Use(cors.Default())
	r.Any("/*any", func(c *gin.Context) {
		path := c.Param("any")
		if strings.HasPrefix(path, "/api") {
			api.HandleContext(c)
			c.Abort()
		} else if c.Request.Method == http.MethodGet {
			static.HandleContext(c)
			c.Abort()
		}
	})

	return r
}

func (cs *ControlServer) Start(port int) {
	log.Info().Int("port", port).Msg("starting ControlServer")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	r := cs.setupRouter()
	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: r,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("ControlServer failed")
		}
	}()

	log.Info().Msg("ControlServer is running")

	<-ctx.Done()
	log.Info().Msg("shutting down ControlServer")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("server forced to shut down")
	} else {
		log.Info().Msg("server shut down gracefully")
	}

	cs.cleanupResources()
}

func (cs *ControlServer) cleanupResources() {
	// Placeholder for any resource cleanup logic
}
