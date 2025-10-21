package services

import (
	"fmt"

	"github.com/pumped-fn/pumped-go/examples/http-api/storage"
)

type UserService struct {
	storage storage.Storage
}

func NewUserService(storage storage.Storage) *UserService {
	return &UserService{storage: storage}
}

func (s *UserService) Create(name, email string) (*storage.User, error) {
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if email == "" {
		return nil, fmt.Errorf("email is required")
	}

	user := &storage.User{
		Name:  name,
		Email: email,
	}

	if err := s.storage.AddUser(user); err != nil {
		return nil, err
	}

	return user, nil
}

func (s *UserService) Get(id int) (*storage.User, error) {
	user, err := s.storage.GetUser(id)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("user not found: %d", id)
	}
	return user, nil
}

func (s *UserService) List() ([]*storage.User, error) {
	return s.storage.ListUsers()
}
