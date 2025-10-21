package main

import (
	"testing"

	pumped "github.com/pumped-fn/pumped-go"
)

func TestGraph_ConfigReactivity(t *testing.T) {
	g := DefineGraph()

	initialConfig := &Config{
		DBPath:     ":memory:",
		ServerPort: 8080,
		LogLevel:   "info",
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Config, initialConfig),
	)
	defer testScope.Dispose()

	db1, err := pumped.Resolve(testScope, g.DB)
	if err != nil {
		t.Fatalf("failed to resolve initial DB: %v", err)
	}

	configAcc := pumped.Accessor(testScope, g.Config)
	newConfig := &Config{
		DBPath:     ":memory:",
		ServerPort: 9090,
		LogLevel:   "debug",
	}

	err = configAcc.Update(newConfig)
	if err != nil {
		t.Fatalf("failed to update config: %v", err)
	}

	db2, err := pumped.Resolve(testScope, g.DB)
	if err != nil {
		t.Fatalf("failed to resolve updated DB: %v", err)
	}

	if db1 == db2 {
		t.Error("expected DB to be reinitialized after config change")
	}
}

func TestGraph_AllComponentsResolve(t *testing.T) {
	g := DefineGraph()

	testConfig := &Config{
		DBPath:     ":memory:",
		ServerPort: 8080,
		LogLevel:   "info",
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Config, testConfig),
	)
	defer testScope.Dispose()

	tests := []struct {
		name string
		fn   func() error
	}{
		{"DB", func() error {
			_, err := pumped.Resolve(testScope, g.DB)
			return err
		}},
		{"ServiceRepo", func() error {
			_, err := pumped.Resolve(testScope, g.ServiceRepo)
			return err
		}},
		{"HealthRepo", func() error {
			_, err := pumped.Resolve(testScope, g.HealthRepo)
			return err
		}},
		{"IncidentRepo", func() error {
			_, err := pumped.Resolve(testScope, g.IncidentRepo)
			return err
		}},
		{"HealthChecker", func() error {
			_, err := pumped.Resolve(testScope, g.HealthChecker)
			return err
		}},
		{"IncidentDetector", func() error {
			_, err := pumped.Resolve(testScope, g.IncidentDetector)
			return err
		}},
		{"Scheduler", func() error {
			_, err := pumped.Resolve(testScope, g.Scheduler)
			return err
		}},
		{"ServiceHandler", func() error {
			_, err := pumped.Resolve(testScope, g.ServiceHandler)
			return err
		}},
		{"HealthHandler", func() error {
			_, err := pumped.Resolve(testScope, g.HealthHandler)
			return err
		}},
		{"IncidentHandler", func() error {
			_, err := pumped.Resolve(testScope, g.IncidentHandler)
			return err
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.fn(); err != nil {
				t.Errorf("failed to resolve %s: %v", tt.name, err)
			}
		})
	}
}

