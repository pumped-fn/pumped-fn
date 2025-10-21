package storage

import (
	"fmt"
	"sync"
)

type User struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type Post struct {
	ID       int    `json:"id"`
	UserID   int    `json:"user_id"`
	Title    string `json:"title"`
	Content  string `json:"content"`
}

type Storage interface {
	AddUser(user *User) error
	GetUser(id int) (*User, error)
	ListUsers() ([]*User, error)

	AddPost(post *Post) error
	GetPost(id int) (*Post, error)
	ListPosts() ([]*Post, error)
	ListPostsByUser(userID int) ([]*Post, error)
}

type MemoryStorage struct {
	mu         sync.RWMutex
	users      []*User
	posts      []*Post
	nextUserID int
	nextPostID int
}

func NewMemoryStorage() *MemoryStorage {
	return &MemoryStorage{
		users:      []*User{},
		posts:      []*Post{},
		nextUserID: 1,
		nextPostID: 1,
	}
}

func (s *MemoryStorage) AddUser(user *User) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, u := range s.users {
		if u.Email == user.Email {
			return fmt.Errorf("user with email %s already exists", user.Email)
		}
	}

	user.ID = s.nextUserID
	s.nextUserID++
	s.users = append(s.users, user)
	return nil
}

func (s *MemoryStorage) GetUser(id int) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, u := range s.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, nil
}

func (s *MemoryStorage) ListUsers() ([]*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*User, len(s.users))
	copy(result, s.users)
	return result, nil
}

func (s *MemoryStorage) AddPost(post *Post) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	post.ID = s.nextPostID
	s.nextPostID++
	s.posts = append(s.posts, post)
	return nil
}

func (s *MemoryStorage) GetPost(id int) (*Post, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, p := range s.posts {
		if p.ID == id {
			return p, nil
		}
	}
	return nil, nil
}

func (s *MemoryStorage) ListPosts() ([]*Post, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Post, len(s.posts))
	copy(result, s.posts)
	return result, nil
}

func (s *MemoryStorage) ListPostsByUser(userID int) ([]*Post, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*Post
	for _, p := range s.posts {
		if p.UserID == userID {
			result = append(result, p)
		}
	}
	return result, nil
}
