# CO₂Router Engine - GitHub Actions CI/CD Documentation

## 🎯 Overview

Production-grade GitHub Actions workflows for the CO₂Router engine that prevent broken routing logic, API routes, types, and builds from being merged or deployed silently.

## 📁 Workflow Files

### 1. `ci.yml` - Main Engine CI Pipeline
**Triggers**: Pull requests, pushes to main, manual dispatch

**Jobs**:
- **ci**: Core validation with type checking, linting, building, and service compilation
- **smoke-test**: API endpoint testing with database and Redis services
- **security-scan**: Dependency audit and secret scanning

**Key Validations**:
- ✅ TypeScript compilation
- ✅ ESLint rules
- ✅ Production build
- ✅ Core service compilation (router, Fingard, providers, decision log)
- ✅ API route imports
- ✅ Environment schema validation
- ✅ Live API endpoint testing
- ✅ Security vulnerability scanning

### 2. `database-deploy.yml` - Database & Deployment Validation
**Triggers**: Pushes to main, manual dispatch

**Jobs**:
- **schema-validate**: Prisma schema and environment validation
- **migration-test**: Migration deployment testing
- **build-and-deploy-validate**: Production build and Docker validation

**Key Validations**:
- ✅ Prisma schema syntax
- ✅ Migration deployment
- ✅ Production build artifacts
- ✅ Docker build capability
- ✅ Critical file presence

### 3. `monitoring.yml` - Production Health Monitoring
**Triggers**: Every 4 hours, manual dispatch

**Jobs**:
- **health-check**: Production endpoint health
- **performance-check**: Response time monitoring
- **dependency-check**: Security vulnerability monitoring
- **integration-check**: DKS integration health

**Key Validations**:
- ✅ Production health endpoint
- ✅ Core API response times
- ✅ Security vulnerabilities
- ✅ DKS integration status

### 4. `code-quality.yml` - Code Quality & Documentation
**Triggers**: Pull requests, pushes to main

**Jobs**:
- **code-quality**: Linting, formatting, debug statement checks
- **api-contract-validation**: API schema and route validation
- **documentation-check**: README and API documentation
- **changelog-check**: Changelog maintenance

**Key Validations**:
- ✅ Code formatting
- ✅ No console.log statements
- ✅ API schema exports
- ✅ Documentation completeness
- ✅ Changelog maintenance

## 🔧 Required Repository Settings

### Branch Protection Rules (Recommended)
**Main Branch Protection**:
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging
- ✅ Require up-to-date branches before merging
- ✅ Do not allow force pushes

**Required Status Checks**:
- `ci` (from ci.yml)
- `code-quality` (from code-quality.yml)
- `schema-validate` (from database-deploy.yml)

### Environment Variables
**No secrets required** for basic CI/CD workflows.

**Optional Secrets for Enhanced Features**:
- `SLACK_WEBHOOK_URL`: For deployment notifications
- `RAILWAY_TOKEN`: For automated Railway deployments

## 🚀 CI/CD Pipeline Flow

### Pull Request Flow
```
PR Opened → ci.yml → code-quality.yml → Ready for Review
```

1. **ci.yml** runs first:
   - Type checking catches broken types
   - Linting catches code quality issues
   - Build catches compilation errors
   - Service validation catches broken imports
   - Smoke tests catch API endpoint issues

2. **code-quality.yml** runs in parallel:
   - Formatting checks ensure consistency
   - Documentation checks ensure completeness
   - API validation ensures contracts work

### Main Branch Deployment Flow
```
Push to Main → All Workflows → Production Validation
```

1. **ci.yml** validates code quality
2. **database-deploy.yml** validates deployment readiness
3. **monitoring.yml** runs periodically to check production health

## 🛡️ What's Prevented

### Broken Code Merges
- ❌ TypeScript compilation errors
- ❌ ESLint rule violations
- ❌ Import/export issues
- ❌ Missing or broken services
- ❌ Environment configuration issues

### Broken Deployments
- ❌ Schema migration failures
- ❌ Production build failures
- ❌ Docker build failures
- ❌ Missing critical files

### Production Issues
- ❌ Security vulnerabilities
- ❌ Performance degradation
- ❌ Integration failures
- ❌ Documentation gaps

## 📊 Validation Coverage

### Core Engine Components
- ✅ **Router Service**: `src/lib/green-routing.ts`
- ✅ **Fingard Service**: `src/services/fingard.service.ts`
- ✅ **Provider Adapters**: `src/lib/carbon/provider-router.ts`
- ✅ **Decision Log**: `src/lib/carbon-command.ts`
- ✅ **Environment Config**: `src/config/env.ts`

### API Routes
- ✅ **Health**: `GET /health`
- ✅ **Routing**: `POST /api/v1/route`
- ✅ **Dashboard**: `GET /api/v1/dashboard/*`
- ✅ **Decisions**: `GET /api/v1/decisions`
- ✅ **Integrations**: `GET /api/v1/integrations/dks/*`
- ✅ **Carbon Command**: `POST /api/v1/carbon/command`

### Quality Gates
- ✅ **Type Safety**: Full TypeScript validation
- ✅ **Code Style**: ESLint + Prettier
- ✅ **API Contracts**: Zod schema validation
- ✅ **Documentation**: README and API docs
- ✅ **Security**: Dependency auditing

## 🔍 Monitoring & Alerting

### Production Health Checks
- **Frequency**: Every 4 hours
- **Endpoints**: Health, routing, dashboard, integrations
- **Response Times**: <2s for health, <5s for routing
- **Integration Status**: DKS endpoints active

### Security Monitoring
- **Dependencies**: Daily vulnerability scanning
- **Secrets**: TruffleHog secret scanning
- **Outdated Packages**: Weekly checks

## 🚨 CI Risks & Mitigations

### Potential Risks
1. **Flaky Tests**: Mitigated by using stable smoke tests
2. **External Dependencies**: Mitigated by using mocked services
3. **Resource Limits**: Mitigated by efficient caching
4. **False Positives**: Mitigated by precise validation rules

### Mitigations Applied
- ✅ **Dependency Caching**: npm cache for faster builds
- ✅ **Service Containers**: Isolated test environments
- ✅ **Timeout Protection**: Prevents hanging jobs
- ✅ **Error Handling**: Clear failure messages

## 📈 Performance Characteristics

### Build Times
- **CI Pipeline**: ~3-4 minutes
- **Database Validation**: ~2 minutes
- **Code Quality**: ~1 minute
- **Total PR Validation**: ~5-7 minutes

### Resource Usage
- **CI Jobs**: 2x CPU, 4GB RAM (standard GitHub runners)
- **Database Tests**: PostgreSQL + Redis containers
- **Security Scans**: Minimal additional overhead

## 🔄 Maintenance

### Workflow Updates
- Review quarterly for optimization
- Update Node.js version annually
- Add new validation rules as needed
- Monitor for deprecated GitHub Actions

### Monitoring
- Check workflow success rates monthly
- Review performance trends
- Update security scanning rules
- Validate integration endpoints

## 🎯 Success Metrics

### Quality Metrics
- **Build Success Rate**: >95%
- **Type Safety**: 100% coverage
- **Code Coverage**: Maintain existing levels
- **Documentation**: 100% API coverage

### Production Metrics
- **Uptime**: >99.9%
- **Response Times**: <2s health, <5s routing
- **Security**: Zero critical vulnerabilities
- **Integration Health**: 100% endpoint availability

---

## 🚀 Getting Started

1. **Enable Branch Protection**: Configure main branch protection with required status checks
2. **Add Workflows**: All workflow files are ready to use
3. **Configure Secrets**: Add optional secrets for enhanced features
4. **Monitor**: Check Actions tab for workflow results

The CO₂Router engine now has production-grade CI/CD that prevents broken code from reaching production while maintaining developer productivity. 🌱
