package services

import (
	"github.com/pumped-fn/pumped-go/examples/http-api/storage"
)

type Stats struct {
	TotalUsers int `json:"total_users"`
	TotalPosts int `json:"total_posts"`
	CacheSize  int `json:"cache_size"`
}

type StatsService struct {
	storage   storage.Storage
	cacheSize int
}

func NewStatsService(storage storage.Storage, cacheSize int) *StatsService {
	return &StatsService{
		storage:   storage,
		cacheSize: cacheSize,
	}
}

func (s *StatsService) GetStats() (*Stats, error) {
	users, err := s.storage.ListUsers()
	if err != nil {
		return nil, err
	}

	posts, err := s.storage.ListPosts()
	if err != nil {
		return nil, err
	}

	return &Stats{
		TotalUsers: len(users),
		TotalPosts: len(posts),
		CacheSize:  s.cacheSize,
	}, nil
}
