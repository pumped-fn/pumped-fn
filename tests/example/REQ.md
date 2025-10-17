# Service Health Monitor System

## Problem Statement

Build a service health monitoring system that tracks the availability and performance of multiple services across an infrastructure. The system must support real-time health checks, historical tracking, incident detection, and alerting.

## Core Requirements

### 1. Service Registry
- Register services with metadata (name, type, criticality level, check interval)
- Update service configuration
- Deregister services
- List all registered services with current health status

### 2. Health Checking
- Execute periodic health checks based on service configuration
- Support multiple check types: HTTP endpoint, TCP port, custom script
- Track response time and status
- Store check results with timestamp

### 3. Incident Management
- Detect when service transitions from healthy to unhealthy (incident start)
- Detect when service recovers (incident end)
- Calculate incident duration and MTTR (Mean Time To Recovery)
- Track incident history per service

### 4. API Endpoints

**Service Management**
- `POST /services` - Register new service
- `GET /services` - List all services with current status
- `GET /services/:id` - Get service details and recent health history
- `PUT /services/:id` - Update service configuration
- `DELETE /services/:id` - Deregister service

**Health Data**
- `GET /services/:id/health` - Current health status
- `GET /services/:id/history?from=<timestamp>&to=<timestamp>` - Health check history
- `POST /services/:id/check` - Trigger manual health check

**Incidents**
- `GET /services/:id/incidents` - List incidents for service
- `GET /incidents/active` - List all active incidents
- `GET /metrics/uptime/:id?period=<7d|30d|90d>` - Calculate uptime percentage

### 5. Background Processing
- Health check scheduler running checks at configured intervals
- Incident detector analyzing health transitions
- Metrics aggregator calculating uptime statistics hourly

## Operational Requirements

### Performance
- Handle 1000+ services
- Execute health checks without blocking API responses
- Query historical data efficiently (indexed by service_id and timestamp)

### Reliability
- Database connection resilience (retry on failure)
- Graceful degradation if checks fail
- Transaction support for incident state changes

### Observability
- Log all health check executions with duration
- Track API request latency
- Expose system metrics (total checks, active incidents, check queue depth)
- Plugin hook for custom alerting (Slack, PagerDuty, email)

### Resource Management
- Database connection pooling
- Proper cleanup on shutdown
- Isolated request contexts (per API call)
- Shared infrastructure resources (DB connection, scheduler)

## Data Model

### Service
```typescript
{
  id: string
  name: string
  type: 'http' | 'tcp' | 'custom'
  endpoint: string
  checkInterval: number  // seconds
  timeout: number        // milliseconds
  criticality: 'low' | 'medium' | 'high' | 'critical'
  createdAt: number
  updatedAt: number
}
```

### HealthCheck
```typescript
{
  id: string
  serviceId: string
  status: 'healthy' | 'unhealthy' | 'unknown'
  responseTime: number | null
  error: string | null
  timestamp: number
}
```

### Incident
```typescript
{
  id: string
  serviceId: string
  startedAt: number
  recoveredAt: number | null
  duration: number | null
  checksFailedCount: number
}
```

## Technical Constraints

- Use SQLite for datastore (simple, embedded)
- Implement using pumped-fn dependency injection patterns
- Scope for long-running resources (database, scheduler)
- Pod for per-request isolation (API handlers)
- Extension points for alerting and custom health checkers
- Proper error handling and logging throughout
- Type-safe implementation (no `any` or `unknown`)

## Success Criteria

1. Can register 100 services and track their health
2. Health checks execute on schedule without drift
3. Incidents detected within one check interval
4. API responses under 100ms (excluding manual check trigger)
5. Uptime calculations accurate to 99.9%
6. System recovers from database connection loss
7. Clean shutdown disposes all resources properly
8. Extension hooks allow custom alerting integration
