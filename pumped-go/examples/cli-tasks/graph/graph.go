package graph

import (
	"github.com/pumped-fn/pumped-go/examples/cli-tasks/services"
	"github.com/pumped-fn/pumped-go/examples/cli-tasks/storage"

	pumped "github.com/pumped-fn/pumped-go"
)

type Graph struct {
	Config      *pumped.Executor[*Config]
	Storage     *pumped.Executor[storage.Storage]
	TaskService *pumped.Executor[*services.TaskService]
	StatsService *pumped.Executor[*services.StatsService]
}

type Config struct {
	StorageType string
	FilePath    string
}

func Define() *Graph {
	config := pumped.Provide(func(ctx *pumped.ResolveCtx) (*Config, error) {
		return &Config{
			StorageType: "memory",
			FilePath:    "tasks.json",
		}, nil
	})

	storageExec := pumped.Derive1(
		config,
		func(ctx *pumped.ResolveCtx, cfgCtrl *pumped.Controller[*Config]) (storage.Storage, error) {
			cfg, err := cfgCtrl.Get()
			if err != nil {
				return nil, err
			}

			switch cfg.StorageType {
			case "memory":
				return storage.NewMemoryStorage(), nil
			case "file":
				return storage.NewFileStorage(cfg.FilePath)
			default:
				return storage.NewMemoryStorage(), nil
			}
		},
	)

	taskService := pumped.Derive1(
		storageExec,
		func(ctx *pumped.ResolveCtx, storageCtrl *pumped.Controller[storage.Storage]) (*services.TaskService, error) {
			store, err := storageCtrl.Get()
			if err != nil {
				return nil, err
			}
			return services.NewTaskService(store), nil
		},
	)

	statsService := pumped.Derive1(
		storageExec,
		func(ctx *pumped.ResolveCtx, storageCtrl *pumped.Controller[storage.Storage]) (*services.StatsService, error) {
			store, err := storageCtrl.Get()
			if err != nil {
				return nil, err
			}
			return services.NewStatsService(store), nil
		},
	)

	return &Graph{
		Config:       config,
		Storage:      storageExec,
		TaskService:  taskService,
		StatsService: statsService,
	}
}
