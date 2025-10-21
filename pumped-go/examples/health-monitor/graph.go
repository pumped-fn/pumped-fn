package main

import (
	"database/sql"

	pumped "github.com/pumped-fn/pumped-go"
)

type Graph struct {
	Config *pumped.Executor[*Config]
	Logger *pumped.Executor[*Logger]

	DB *pumped.Executor[*sql.DB]

	ServiceRepo  *pumped.Executor[ServiceRepo]
	HealthRepo   *pumped.Executor[HealthCheckRepo]
	IncidentRepo *pumped.Executor[IncidentRepo]

	HealthChecker    *pumped.Executor[*HealthChecker]
	IncidentDetector *pumped.Executor[*IncidentDetector]

	Scheduler *pumped.Executor[*Scheduler]

	ServiceHandler  *pumped.Executor[*ServiceHandler]
	HealthHandler   *pumped.Executor[*HealthHandler]
	IncidentHandler *pumped.Executor[*IncidentHandler]
}

func DefineGraph() *Graph {
	config := pumped.Provide(func(ctx *pumped.ResolveCtx) (*Config, error) {
		return DefaultConfig(), nil
	})

	logger := pumped.Derive1(
		config.Reactive(),
		func(ctx *pumped.ResolveCtx, cfgCtrl *pumped.Controller[*Config]) (*Logger, error) {
			cfg, err := cfgCtrl.Get()
			if err != nil {
				return nil, err
			}
			return NewLogger(cfg.LogLevel, nil), nil
		},
	)

	db := pumped.Derive1(
		config.Reactive(),
		func(ctx *pumped.ResolveCtx, cfgCtrl *pumped.Controller[*Config]) (*sql.DB, error) {
			cfg, err := cfgCtrl.Get()
			if err != nil {
				return nil, err
			}
			database, err := NewDB(cfg.DBPath)
			if err != nil {
				return nil, err
			}

			ctx.OnCleanup(func() error {
				return database.Close()
			})

			return database, nil
		},
	)

	serviceRepo := pumped.Derive1(
		db,
		func(ctx *pumped.ResolveCtx, dbCtrl *pumped.Controller[*sql.DB]) (ServiceRepo, error) {
			database, err := dbCtrl.Get()
			if err != nil {
				return nil, err
			}
			return NewServiceRepository(database), nil
		},
	)

	healthRepo := pumped.Derive1(
		db,
		func(ctx *pumped.ResolveCtx, dbCtrl *pumped.Controller[*sql.DB]) (HealthCheckRepo, error) {
			database, err := dbCtrl.Get()
			if err != nil {
				return nil, err
			}
			return NewHealthCheckRepository(database), nil
		},
	)

	incidentRepo := pumped.Derive1(
		db,
		func(ctx *pumped.ResolveCtx, dbCtrl *pumped.Controller[*sql.DB]) (IncidentRepo, error) {
			database, err := dbCtrl.Get()
			if err != nil {
				return nil, err
			}
			return NewIncidentRepository(database), nil
		},
	)

	healthChecker := pumped.Provide(func(ctx *pumped.ResolveCtx) (*HealthChecker, error) {
		return NewHealthChecker(), nil
	})

	incidentDetector := pumped.Derive1(
		incidentRepo,
		func(ctx *pumped.ResolveCtx, repoCtrl *pumped.Controller[IncidentRepo]) (*IncidentDetector, error) {
			repo, err := repoCtrl.Get()
			if err != nil {
				return nil, err
			}
			return NewIncidentDetector(repo), nil
		},
	)

	schedulerExec := pumped.Derive5(
		serviceRepo,
		healthRepo,
		healthChecker,
		incidentDetector,
		logger,
		func(ctx *pumped.ResolveCtx,
			srCtrl *pumped.Controller[ServiceRepo],
			hrCtrl *pumped.Controller[HealthCheckRepo],
			hcCtrl *pumped.Controller[*HealthChecker],
			idCtrl *pumped.Controller[*IncidentDetector],
			logCtrl *pumped.Controller[*Logger]) (*Scheduler, error) {
			sr, _ := srCtrl.Get()
			hr, _ := hrCtrl.Get()
			hc, _ := hcCtrl.Get()
			id, _ := idCtrl.Get()
			log, _ := logCtrl.Get()

			sched := NewScheduler(sr, hr, hc, id, log)
			sched.Start()

			ctx.OnCleanup(func() error {
				sched.Stop()
				return nil
			})

			return sched, nil
		},
	)

	serviceHandler := pumped.Derive2(
		serviceRepo,
		healthRepo,
		func(ctx *pumped.ResolveCtx,
			srCtrl *pumped.Controller[ServiceRepo],
			hrCtrl *pumped.Controller[HealthCheckRepo]) (*ServiceHandler, error) {
			sr, _ := srCtrl.Get()
			hr, _ := hrCtrl.Get()
			return NewServiceHandler(sr, hr), nil
		},
	)

	healthHandler := pumped.Derive3(
		serviceRepo,
		healthRepo,
		healthChecker,
		func(ctx *pumped.ResolveCtx,
			srCtrl *pumped.Controller[ServiceRepo],
			hrCtrl *pumped.Controller[HealthCheckRepo],
			hcCtrl *pumped.Controller[*HealthChecker]) (*HealthHandler, error) {
			sr, _ := srCtrl.Get()
			hr, _ := hrCtrl.Get()
			hc, _ := hcCtrl.Get()
			return NewHealthHandler(sr, hr, hc), nil
		},
	)

	incidentHandler := pumped.Derive1(
		incidentRepo,
		func(ctx *pumped.ResolveCtx, irCtrl *pumped.Controller[IncidentRepo]) (*IncidentHandler, error) {
			ir, _ := irCtrl.Get()
			return NewIncidentHandler(ir), nil
		},
	)

	return &Graph{
		Config:           config,
		Logger:           logger,
		DB:               db,
		ServiceRepo:      serviceRepo,
		HealthRepo:       healthRepo,
		IncidentRepo:     incidentRepo,
		HealthChecker:    healthChecker,
		IncidentDetector: incidentDetector,
		Scheduler:        schedulerExec,
		ServiceHandler:   serviceHandler,
		HealthHandler:    healthHandler,
		IncidentHandler:  incidentHandler,
	}
}
