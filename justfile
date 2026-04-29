# Web — HomeAccounting frontend client
# Usage: just <recipe>
# List all recipes: just --list

# Default recipe to display help
default:
    @just --list

# Install pnpm dependencies
install:
    @echo "Installing dependencies..."
    pnpm install
    @echo "✓ Install complete"

# Start the Vite dev server
run:
    pnpm dev

# Build the production bundle
build:
    @echo "Building production bundle..."
    pnpm build
    @echo "✓ Build complete"

# Preview the production bundle
preview:
    pnpm preview

# Type check (no emit)
typecheck:
    @echo "Type checking..."
    pnpm exec tsc --noEmit
    @echo "✓ Type check complete"

# Lint with ESLint
lint:
    @echo "Linting..."
    pnpm exec eslint .
    @echo "✓ Lint complete"

# Format with Prettier
format:
    @echo "Formatting..."
    pnpm exec prettier --write .
    @echo "✓ Format complete"

# Check formatting without modifying files
format-check:
    @echo "Checking format..."
    pnpm exec prettier --check .
    @echo "✓ Format check complete"

# Type check + lint + format check
check: typecheck lint format-check
    @echo "✓ All checks passed"

# Run unit and component tests once
test:
    @echo "Running tests..."
    pnpm exec vitest run
    @echo "✓ Tests complete"

# Run tests in watch mode
test-watch:
    pnpm exec vitest

# Run end-to-end tests (Playwright; requires backend running locally)
e2e:
    pnpm exec playwright test

# Clean build artifacts and node_modules
clean:
    @echo "Cleaning..."
    rm -rf dist node_modules .vite playwright-report test-results
    @echo "✓ Clean complete"

# Setup development environment
dev-setup: install
    @echo "Development environment ready!"
    @echo ""
    @echo "Next steps:"
    @echo "  1. Copy .env.example to .env and adjust VITE_API_BASE_URL"
    @echo "  2. Run 'just run' to start the dev server"
    @echo "  3. Visit http://localhost:5173/app/"

# Clean and reinstall + build
rebuild: clean install build

# Run all checks and build
all: check test build
    @echo "✓ All tasks complete"

# Trigger CI workflow for the current branch
ci:
    gh workflow run CI --ref "$(git branch --show-current)"
