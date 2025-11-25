# Orchestrator

A Go-based control server with an embedded React frontend, featuring real-time log streaming, monitoring capabilities, and a complete development environment in a devcontainer.

## 🚀 Features

- **Real-time Log Streaming**: Server-Sent Events (SSE) based log tailing with automatic file rotation detection
- **Web UI Dashboard**: React + TypeScript frontend with real-time log viewer
  - Live log streaming with auto-scroll
  - Search and highlight functionality
  - Log download and truncation
  - Color-coded log levels (TRACE, DEBUG, INFO, WARN, ERROR, FATAL, PANIC)
- **RESTful API**: Gin-based HTTP server with CORS support
- **Structured Logging**: Zerolog integration with rolling file logs via Lumberjack
- **Performance Monitoring**: Built-in pprof and expvar endpoints for profiling
- **Graceful Shutdown**: Proper signal handling and resource cleanup
- **Production Ready**: Request size limiting, error recovery, and file watcher resilience

## 📋 Prerequisites

- Docker (for devcontainer)
- VS Code with Remote-Containers extension

## 🏗️ Architecture

```
orchestrator/
├── controlserver/          # Go backend
│   ├── main.go            # Application entry point
│   ├── app/               # Core application logic
│   │   ├── app.go         # HTTP server setup & handlers
│   │   └── frontend/      # React frontend (embedded)
│   └── logger/            # Logging utilities
├── client/                # (Empty - future client implementation)
├── Dockerfile             # Multi-stage dev container
├── Taskfile.yml           # Task automation
└── .devcontainer/         # VS Code devcontainer config
```

### Tech Stack

**Backend:**
- Go 1.25.4
- Gin Web Framework
- Zerolog (structured logging)
- Lumberjack (log rotation)
- fsnotify (file watching)

**Frontend:**
- React 19
- TypeScript
- Vite (build tool)
- Tailwind CSS 4
- Zustand (state management)
- Lucide React (icons)
- Sonner (toast notifications)

## 🚦 Quick Start - Using VS Code Devcontainer

1. Clone the repository:
   ```bash
   git clone https://github.com/cdmatta/orchestrator.git
   cd orchestrator
   ```

2. Open in VS Code:
   ```bash
   code .
   ```

3. When prompted, click **"Reopen in Container"**

4. The devcontainer will automatically:
   - Build the Docker image
   - Install all dependencies (Go modules + npm packages)
   - Build the frontend
   - Create the log file

5. Use VS Code's Run & Debug → `controlserver`

6. Access the application:
   - Web UI: http://localhost:8888
