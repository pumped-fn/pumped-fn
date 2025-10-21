package services

import (
	"fmt"

	"github.com/pumped-fn/pumped-go/examples/http-api/storage"
)

type PostService struct {
	storage     storage.Storage
	userService *UserService
}

func NewPostService(storage storage.Storage, userService *UserService) *PostService {
	return &PostService{
		storage:     storage,
		userService: userService,
	}
}

func (s *PostService) Create(userID int, title, content string) (*storage.Post, error) {
	if _, err := s.userService.Get(userID); err != nil {
		return nil, fmt.Errorf("invalid user: %w", err)
	}

	if title == "" {
		return nil, fmt.Errorf("title is required")
	}

	post := &storage.Post{
		UserID:  userID,
		Title:   title,
		Content: content,
	}

	if err := s.storage.AddPost(post); err != nil {
		return nil, err
	}

	return post, nil
}

func (s *PostService) Get(id int) (*storage.Post, error) {
	post, err := s.storage.GetPost(id)
	if err != nil {
		return nil, err
	}
	if post == nil {
		return nil, fmt.Errorf("post not found: %d", id)
	}
	return post, nil
}

func (s *PostService) List() ([]*storage.Post, error) {
	return s.storage.ListPosts()
}

func (s *PostService) ListByUser(userID int) ([]*storage.Post, error) {
	if _, err := s.userService.Get(userID); err != nil {
		return nil, fmt.Errorf("invalid user: %w", err)
	}

	return s.storage.ListPostsByUser(userID)
}
