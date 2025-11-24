package main

import (
	"controlserver/app"
	"controlserver/logger"
	"flag"

	"github.com/rs/zerolog/log"
)

var logLevel string
var controlServerPort int

func main() {
	flag.StringVar(&logLevel, "logLevel", "info", "Set log level (info, debug, trace)")
	flag.IntVar(&controlServerPort, "controlServerPort", 8888, "Port for the Control server")
	flag.Parse()

	logger.ConfigureMainLogger(logLevel)
	log.Info().
		Str("logLevel", logLevel).
		Int("controlServerPort", controlServerPort).
		Msg("starting control server")

	cs := app.New()
	cs.Start(controlServerPort)
}
