package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pumped-fn/pumped-go/examples/http-api/graph"
	"github.com/pumped-fn/pumped-go/examples/http-api/handlers"

	pumped "github.com/pumped-fn/pumped-go"
	"github.com/pumped-fn/pumped-go/extensions"
)

func main() {
	ctx := context.Background()

	scope := pumped.NewScope(
		pumped.WithExtension(extensions.NewLoggingExtension()),
	)
	defer scope.Dispose()

	g := graph.Define()

	mux := http.NewServeMux()
	handlers.Register(mux, scope, g)

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	go func() {
		fmt.Println("Server starting on :8080")
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-sigCh
	fmt.Println("\nShutting down gracefully...")

	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}

	if err := scope.Dispose(); err != nil {
		log.Printf("Scope disposal error: %v", err)
	}

	fmt.Println("Server stopped")
}
