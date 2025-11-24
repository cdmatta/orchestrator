package logger

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/natefinch/lumberjack"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

const ControlServerLogFilePath = "/var/log/controlserver.log"

func GetRollingLogger(filePath string) *lumberjack.Logger {
	return &lumberjack.Logger{
		Filename:   filePath, // Path to the log file
		MaxSize:    10,       // Max size in megabytes before rotation
		MaxBackups: 5,        // Max number of old log files to keep
		MaxAge:     30,       // Max number of days to retain old log files
		Compress:   true,     // Whether to compress rotated files
	}
}

func ResetLogFile(filePath string) error {
	if _, err := os.Stat(filePath); err == nil {
		if err := os.Truncate(filePath, 0); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	filePrefix := strings.TrimSuffix(filePath, ".log")
	pattern := filePrefix + "-*.log.gz"
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return err
	}

	for _, match := range matches {
		if err := os.Remove(match); err != nil {
			return err
		}
	}

	return nil
}

func ConfigureMainLogger(logLevel string) {
	level := strings.ToLower(logLevel)
	switch level {
	case "debug":
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	case "trace":
		zerolog.SetGlobalLevel(zerolog.TraceLevel)
	default:
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}

	logFile := GetRollingLogger(ControlServerLogFilePath)
	consoleWriter := zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}
	fileWriter := zerolog.ConsoleWriter{Out: logFile, TimeFormat: time.RFC3339, NoColor: true}
	multiWriter := zerolog.MultiLevelWriter(consoleWriter, fileWriter)
	log.Logger = log.Output(multiWriter)
}

func GinLoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		duration := time.Since(start)
		statusCode := c.Writer.Status()
		method := c.Request.Method
		path := c.Request.URL.Path

		log.Trace().
			Str("method", method).
			Str("path", path).
			Int("status", statusCode).
			Dur("latency", duration).
			Msg("")
	}
}

type ZerologWriter struct {
	logger zerolog.Logger
	level  zerolog.Level
}

func (z *ZerologWriter) Write(p []byte) (n int, err error) {
	z.logger.WithLevel(z.level).Msg(string(p))
	return len(p), nil
}

func LogWriter(level zerolog.Level) *ZerologWriter {
	return &ZerologWriter{
		logger: log.Logger,
		level:  level,
	}
}
