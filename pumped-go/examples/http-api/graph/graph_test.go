package graph

import (
	"testing"

	pumped "github.com/pumped-fn/pumped-go"
	"github.com/pumped-fn/pumped-go/examples/http-api/storage"
)

type MockStorage struct {
	users map[int]*storage.User
	posts map[int]*storage.Post
}

func (m *MockStorage) AddUser(user *storage.User) error {
	m.users[user.ID] = user
	return nil
}

func (m *MockStorage) GetUser(id int) (*storage.User, error) {
	if user, ok := m.users[id]; ok {
		return user, nil
	}
	return nil, nil
}

func (m *MockStorage) ListUsers() ([]*storage.User, error) {
	users := make([]*storage.User, 0, len(m.users))
	for _, u := range m.users {
		users = append(users, u)
	}
	return users, nil
}

func (m *MockStorage) AddPost(post *storage.Post) error {
	m.posts[post.ID] = post
	return nil
}

func (m *MockStorage) GetPost(id int) (*storage.Post, error) {
	if post, ok := m.posts[id]; ok {
		return post, nil
	}
	return nil, nil
}

func (m *MockStorage) ListPostsByUser(userID int) ([]*storage.Post, error) {
	posts := make([]*storage.Post, 0)
	for _, p := range m.posts {
		if p.UserID == userID {
			posts = append(posts, p)
		}
	}
	return posts, nil
}

func (m *MockStorage) ListPosts() ([]*storage.Post, error) {
	posts := make([]*storage.Post, 0, len(m.posts))
	for _, p := range m.posts {
		posts = append(posts, p)
	}
	return posts, nil
}

func TestUserServiceWithMockStorage(t *testing.T) {
	g := Define()

	mockStorage := &MockStorage{
		users: map[int]*storage.User{
			1: {ID: 1, Name: "Alice", Email: "alice@example.com"},
			2: {ID: 2, Name: "Bob", Email: "bob@example.com"},
		},
		posts: map[int]*storage.Post{},
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Storage, mockStorage),
	)

	userService, err := pumped.Resolve(testScope, g.UserService)
	if err != nil {
		t.Fatalf("failed to resolve UserService: %v", err)
	}

	user, err := userService.Get(1)
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}

	if user.Name != "Alice" {
		t.Errorf("expected user name 'Alice', got %s", user.Name)
	}

	users, err := userService.List()
	if err != nil {
		t.Fatalf("failed to list users: %v", err)
	}

	if len(users) != 2 {
		t.Errorf("expected 2 users, got %d", len(users))
	}
}

func TestPostServiceWithMockStorage(t *testing.T) {
	g := Define()

	mockStorage := &MockStorage{
		users: map[int]*storage.User{
			1: {ID: 1, Name: "Alice", Email: "alice@example.com"},
		},
		posts: map[int]*storage.Post{
			1: {ID: 1, Title: "First Post", Content: "Hello", UserID: 1},
			2: {ID: 2, Title: "Second Post", Content: "World", UserID: 1},
		},
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Storage, mockStorage),
	)

	postService, err := pumped.Resolve(testScope, g.PostService)
	if err != nil {
		t.Fatalf("failed to resolve PostService: %v", err)
	}

	post, err := postService.Get(1)
	if err != nil {
		t.Fatalf("failed to get post: %v", err)
	}

	if post.Title != "First Post" {
		t.Errorf("expected post title 'First Post', got %s", post.Title)
	}

	posts, err := postService.ListByUser(1)
	if err != nil {
		t.Fatalf("failed to get user posts: %v", err)
	}

	if len(posts) != 2 {
		t.Errorf("expected 2 posts, got %d", len(posts))
	}
}

func TestStatsServiceWithConfigChange(t *testing.T) {
	g := Define()

	mockStorage := &MockStorage{
		users: map[int]*storage.User{
			1: {ID: 1, Name: "Alice", Email: "alice@example.com"},
			2: {ID: 2, Name: "Bob", Email: "bob@example.com"},
			3: {ID: 3, Name: "Charlie", Email: "charlie@example.com"},
		},
		posts: map[int]*storage.Post{},
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Storage, mockStorage),
	)

	statsService, err := pumped.Resolve(testScope, g.StatsService)
	if err != nil {
		t.Fatalf("failed to resolve StatsService: %v", err)
	}

	stats, err := statsService.GetStats()
	if err != nil {
		t.Fatalf("failed to get stats: %v", err)
	}

	if stats.TotalUsers != 3 {
		t.Errorf("expected 3 total users, got %d", stats.TotalUsers)
	}

	configCtrl := pumped.Accessor(testScope, g.Config)
	configCtrl.Update(&Config{
		MaxUsersCache:   200,
		RateLimitPerMin: 120,
	})

	statsService2, err := pumped.Resolve(testScope, g.StatsService)
	if err != nil {
		t.Fatalf("failed to resolve StatsService after config update: %v", err)
	}

	if statsService == statsService2 {
		t.Error("expected new StatsService instance after reactive config update")
	}

	stats2, err := statsService2.GetStats()
	if err != nil {
		t.Fatalf("failed to get stats after update: %v", err)
	}

	if stats2.TotalUsers != 3 {
		t.Errorf("expected 3 total users after update, got %d", stats2.TotalUsers)
	}
}

func TestMultiplePresets(t *testing.T) {
	g := Define()

	mockStorage := &MockStorage{
		users: map[int]*storage.User{},
		posts: map[int]*storage.Post{},
	}

	testConfig := &Config{
		MaxUsersCache:   50,
		RateLimitPerMin: 30,
	}

	testScope := pumped.NewScope(
		pumped.WithPreset(g.Storage, mockStorage),
		pumped.WithPreset(g.Config, testConfig),
	)

	statsService, err := pumped.Resolve(testScope, g.StatsService)
	if err != nil {
		t.Fatalf("failed to resolve StatsService: %v", err)
	}

	stats, err := statsService.GetStats()
	if err != nil {
		t.Fatalf("failed to get stats: %v", err)
	}

	if stats.TotalUsers != 0 {
		t.Errorf("expected 0 total users, got %d", stats.TotalUsers)
	}
}
