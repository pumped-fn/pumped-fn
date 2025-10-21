package graph

import (
	"github.com/pumped-fn/pumped-go/examples/http-api/services"
	"github.com/pumped-fn/pumped-go/examples/http-api/storage"

	pumped "github.com/pumped-fn/pumped-go"
)

type Graph struct {
	Config       *pumped.Executor[*Config]
	Storage      *pumped.Executor[storage.Storage]
	UserService  *pumped.Executor[*services.UserService]
	PostService  *pumped.Executor[*services.PostService]
	StatsService *pumped.Executor[*services.StatsService]
}

type Config struct {
	MaxUsersCache int
	RateLimitPerMin int
}

func Define() *Graph {
	config := pumped.Provide(func(ctx *pumped.ResolveCtx) (*Config, error) {
		return &Config{
			MaxUsersCache:   100,
			RateLimitPerMin: 60,
		}, nil
	})

	storageExec := pumped.Provide(func(ctx *pumped.ResolveCtx) (storage.Storage, error) {
		return storage.NewMemoryStorage(), nil
	})

	userService := pumped.Derive1(
		storageExec,
		func(ctx *pumped.ResolveCtx, storageCtrl *pumped.Controller[storage.Storage]) (*services.UserService, error) {
			store, err := storageCtrl.Get()
			if err != nil {
				return nil, err
			}
			return services.NewUserService(store), nil
		},
	)

	postService := pumped.Derive2(
		storageExec,
		userService,
		func(ctx *pumped.ResolveCtx,
			storageCtrl *pumped.Controller[storage.Storage],
			userServiceCtrl *pumped.Controller[*services.UserService]) (*services.PostService, error) {
			store, err := storageCtrl.Get()
			if err != nil {
				return nil, err
			}
			userSvc, err := userServiceCtrl.Get()
			if err != nil {
				return nil, err
			}
			return services.NewPostService(store, userSvc), nil
		},
	)

	statsService := pumped.Derive2(
		storageExec,
		config.Reactive(),
		func(ctx *pumped.ResolveCtx,
			storageCtrl *pumped.Controller[storage.Storage],
			configCtrl *pumped.Controller[*Config]) (*services.StatsService, error) {
			store, err := storageCtrl.Get()
			if err != nil {
				return nil, err
			}
			cfg, err := configCtrl.Get()
			if err != nil {
				return nil, err
			}
			return services.NewStatsService(store, cfg.MaxUsersCache), nil
		},
	)

	return &Graph{
		Config:       config,
		Storage:      storageExec,
		UserService:  userService,
		PostService:  postService,
		StatsService: statsService,
	}
}
