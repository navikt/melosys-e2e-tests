.PHONY: default
default: | help

.PHONY: help
help: ## Show this help message
	@echo "📖 Melosys E2E Tests - Makefile Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# ==============================================================================
# Docker Network
# ==============================================================================

.PHONY: network-check
network-check: ## Check/create Docker network
	@docker network inspect melosys.docker-internal >/dev/null 2>&1 || \
	(echo "🌐 Creating melosys.docker-internal network..." && docker network create melosys.docker-internal)

# ==============================================================================
# Service Management
# ==============================================================================

.PHONY: start
start: network-check ## Start all services (Mac ARM)
	@echo "🚀 Starting all services..."
	@echo "   Platform: Mac ARM (Oracle: freepdb1)"
	@MELOSYS_ORACLE_DB_NAME=freepdb1 MELOSYS_API_TAG=latest docker compose up -d
	@echo ""
	@echo "ℹ️  Note: Feature toggles are automatically created by melosys-api on startup"
	@echo ""
	@echo "✅ All services started!"
	@echo ""
	@$(MAKE) urls

.PHONY: start-intel
start-intel: network-check ## Start all services (Intel/Linux)
	@echo "🚀 Starting all services..."
	@echo "   Platform: Intel/Linux (Oracle: XEPDB1)"
	@MELOSYS_ORACLE_DB_NAME=XEPDB1 ORACLE_IMAGE=gvenzl/oracle-xe:18.4.0-slim MELOSYS_API_TAG=latest docker compose up -d
	@echo ""
	@echo "ℹ️  Note: Feature toggles are automatically created by melosys-api on startup"
	@echo ""
	@echo "✅ All services started!"
	@echo ""
	@$(MAKE) urls

.PHONY: start-detached
start-detached: network-check ## Start services in detached mode (no logs)
	@MELOSYS_ORACLE_DB_NAME=freepdb1 MELOSYS_API_TAG=latest docker compose up -d
	@echo "ℹ️  Note: Feature toggles are automatically created by melosys-api on startup"

.PHONY: stop
stop: ## Stop all services
	@echo "🛑 Stopping all services..."
	@docker compose stop
	@echo "✅ Services stopped"

.PHONY: restart
restart: ## Restart all services
	@echo "🔄 Restarting services..."
	@docker compose restart
	@echo "✅ Services restarted"

.PHONY: down
down: ## Stop and remove all services
	@echo "🗑️  Stopping and removing all services..."
	@docker compose down -v
	@echo "✅ Services removed"

.PHONY: clean
clean: down ## Stop services and clean up
	@echo "🧹 Cleaning up..."
	@docker network rm melosys.docker-internal || true
	@echo "✅ Cleanup complete"

# ==============================================================================
# Service Health & Status
# ==============================================================================

.PHONY: status
status: ## Show service status
	@docker compose ps

.PHONY: logs
logs: ## Show logs from all services
	@docker compose logs -f

.PHONY: logs-api
logs-api: ## Show logs from melosys-api
	@docker compose logs -f melosys-api

.PHONY: logs-web
logs-web: ## Show logs from melosys-web
	@docker compose logs -f melosys-web

.PHONY: logs-unleash
logs-unleash: ## Show logs from Unleash
	@docker compose logs -f unleash

.PHONY: health
health: ## Check health of critical services
	@echo "🏥 Checking service health..."
	@echo ""
	@echo "📊 Oracle Database:"
	@docker inspect --format='{{.State.Health.Status}}' melosys-oracle 2>/dev/null || echo "  ❌ Not running"
	@echo ""
	@echo "📊 Kafka:"
	@docker inspect --format='{{.State.Health.Status}}' kafka 2>/dev/null || echo "  ❌ Not running"
	@echo ""
	@echo "📊 Unleash:"
	@curl -sf http://localhost:4242/health > /dev/null 2>&1 && echo "  ✅ Healthy" || echo "  ❌ Unhealthy"
	@echo ""
	@echo "📊 melosys-api:"
	@curl -sf http://localhost:8080/internal/health > /dev/null 2>&1 && echo "  ✅ Healthy" || echo "  ❌ Unhealthy"
	@echo ""
	@echo "📊 melosys-web:"
	@curl -sf http://localhost:3000/melosys/ > /dev/null 2>&1 && echo "  ✅ Healthy" || echo "  ❌ Unhealthy"

.PHONY: wait-healthy
wait-healthy: ## Wait for all services to be healthy
	@echo "⏳ Waiting for services to be healthy..."
	@max_attempts=60; \
	attempt=0; \
	while [ $$attempt -lt $$max_attempts ]; do \
		attempt=$$((attempt + 1)); \
		echo "   Attempt $$attempt/$$max_attempts"; \
		oracle_health=$$(docker inspect --format='{{.State.Health.Status}}' melosys-oracle 2>/dev/null || echo "unhealthy"); \
		kafka_health=$$(docker inspect --format='{{.State.Health.Status}}' kafka 2>/dev/null || echo "unhealthy"); \
		unleash_health=$$(curl -sf http://localhost:4242/health > /dev/null 2>&1 && echo "healthy" || echo "unhealthy"); \
		api_health=$$(curl -sf http://localhost:8080/internal/health > /dev/null 2>&1 && echo "healthy" || echo "unhealthy"); \
		web_health=$$(curl -sf http://localhost:3000/melosys/ > /dev/null 2>&1 && echo "healthy" || echo "unhealthy"); \
		if [ "$$oracle_health" = "healthy" ] && [ "$$kafka_health" = "healthy" ] && [ "$$unleash_health" = "healthy" ] && [ "$$api_health" = "healthy" ] && [ "$$web_health" = "healthy" ]; then \
			echo "✅ All services healthy!"; \
			break; \
		fi; \
		if [ $$attempt -eq $$max_attempts ]; then \
			echo "❌ Services failed to become healthy"; \
			exit 1; \
		fi; \
		sleep 10; \
	done

# ==============================================================================
# Unleash Management
# ==============================================================================

.PHONY: unleash-ui
unleash-ui: ## Open Unleash UI in browser
	@echo "🌐 Opening Unleash UI..."
	@echo "   URL: http://localhost:4242"
	@echo "   Username: admin"
	@echo "   Password: unleash4all"
	@open http://localhost:4242 || xdg-open http://localhost:4242 || echo "Please open http://localhost:4242 manually"

# ==============================================================================
# Testing
# ==============================================================================

.PHONY: test
test: ## Run all E2E tests
	@npm test

.PHONY: test-ui
test-ui: ## Run tests in UI mode
	@npm run test:ui

.PHONY: test-headed
test-headed: ## Run tests with visible browser
	@npm run test:headed

.PHONY: test-debug
test-debug: ## Run tests in debug mode
	@npm run test:debug

# ==============================================================================
# Development
# ==============================================================================

.PHONY: codegen
codegen: ## Record new workflow with Playwright codegen
	@npm run codegen

.PHONY: show-report
show-report: ## View HTML test report
	@npm run show-report

.PHONY: clean-results
clean-results: ## Clean test results
	@npm run clean-results

# ==============================================================================
# Information
# ==============================================================================

.PHONY: urls
urls: ## Show all service URLs
	@echo "🌐 Service URLs:"
	@echo ""
	@echo "  Frontend:"
	@echo "    melosys-web:          http://localhost:3000/melosys/"
	@echo ""
	@echo "  Backend:"
	@echo "    melosys-api:          http://localhost:8080"
	@echo "    melosys-api health:   http://localhost:8080/internal/health"
	@echo ""
	@echo "  Services:"
	@echo "    Unleash UI:           http://localhost:4242 (admin/unleash4all)"
	@echo "    Kafka UI:             http://localhost:8087"
	@echo "    faktureringskomp:     http://localhost:8084"
	@echo "    trygdeavgift:         http://localhost:8095"
	@echo "    dokgen:               http://localhost:8888"
	@echo "    melosys-mock:         http://localhost:8083"
	@echo ""
	@echo "  Infrastructure:"
	@echo "    Oracle:               localhost:1521"
	@echo "    PostgreSQL:           localhost:5432"
	@echo "    Kafka:                localhost:9092, localhost:29092"

.PHONY: quick-start
quick-start: ## Quick start guide
	@echo "🚀 Melosys E2E Tests - Quick Start"
	@echo ""
	@echo "1. Start services (Mac ARM):"
	@echo "   make start"
	@echo ""
	@echo "2. Run tests:"
	@echo "   make test"
	@echo ""
	@echo "3. View Unleash UI:"
	@echo "   make unleash-ui"
	@echo ""
	@echo "4. Stop services:"
	@echo "   make stop"
	@echo ""
	@echo "For Intel/Linux: use 'make start-intel' instead"
	@echo ""
	@echo "For more commands: make help"
