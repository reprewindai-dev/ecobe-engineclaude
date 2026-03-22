# CO₂Router Dashboard - GitHub Actions CI Documentation

## 🎯 Overview

Production-grade GitHub Actions for the CO₂Router dashboard that catch broken frontend builds, API client wiring, and branding issues before merge or deployment.

## 📁 Workflow File

### `ci.yml` - Dashboard CI Pipeline
**Triggers**: Pull requests, pushes to main, manual dispatch

**Jobs**:
- **ci**: Core frontend validation with type checking, linting, building, and structure validation
- **smoke-test**: Dashboard smoke testing with live server
- **security-scan**: Dependency audit and secret scanning

## 🔧 Validations Performed

### Frontend Build Validation
- ✅ **TypeScript compilation**: Catches type errors in React components
- ✅ **ESLint validation**: Ensures code quality and consistency
- ✅ **Production build**: Validates Next.js build process
- ✅ **Critical file presence**: Ensures essential files exist

### Route & Import Validation
- ✅ **Layout imports**: Verifies root layout compiles correctly
- ✅ **Page imports**: Checks main and DKS dashboard pages
- ✅ **API client modules**: Validates API proxy endpoints
- ✅ **Component imports**: Ensures dashboard components load

### API Client Integration
- ✅ **API route validation**: Checks `/api/integrations/dekes/route.ts`
- ✅ **Environment configuration**: Validates `ECOBE_API_URL` setup
- ✅ **API proxy testing**: Tests API endpoints during smoke tests

### Branding Protection
- ✅ **Banned references**: Prevents "Electricity Maps" reintroduction
- ✅ **CO₂Router branding**: Ensures correct branding is present
- ✅ **Content consistency**: Validates public-facing copy

### Code Quality
- ✅ **Debug statement removal**: Prevents console.log in production
- ✅ **Import validation**: Catches broken imports/exports
- ✅ **Structure validation**: Ensures proper file organization

## 🚨 What's Prevented

### Broken Frontend Builds
- ❌ TypeScript compilation errors
- ❌ ESLint rule violations
- ❌ Next.js build failures
- ❌ Missing critical files

### Broken API Integration
- ❌ API client import failures
- ❌ Broken API proxy routes
- ❌ Environment configuration issues
- ❌ Missing environment variables

### Branding Regressions
- ❌ Reintroduction of banned provider references
- ❌ Inconsistent CO₂Router branding
- ❌ Public-facing copy issues

### Code Quality Issues
- ❌ Debug statements in production
- ❌ Broken imports/exports
- ❌ Poor code organization

## 🛡️ Smoke Test Coverage

### Dashboard Load Testing
- ✅ **Main page load**: Validates homepage renders with correct branding
- ✅ **DKS integration page**: Ensures DKS dashboard loads
- ✅ **API proxy response**: Tests API endpoints respond correctly

### Server Validation
- ✅ **Production build startup**: Ensures built application starts
- ✅ **Port binding**: Validates server binds correctly
- ✅ **Response handling**: Checks HTTP responses

## 🔧 Repository Settings

### Branch Protection Rules (Recommended)
**Main Branch Protection**:
```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci"]
  },
  "enforce_admins": true,
  "require_up_to_date_branch": true
}
```

### Required Status Checks
- **`ci`** - Core validation pipeline
- **`smoke-test`** - Dashboard functionality (optional but recommended)

## 🔍 Environment Variables

### Required for CI
- **None** - CI runs without secrets

### Required for Production
```bash
ECOBE_API_URL=https://ecobe-engineclaude-production.up.railway.app
NEXT_PUBLIC_APP_URL=https://co2-router-dashboard-production.up.railway.app
```

### Documented in `.env.example`
```bash
ECOBE_API_URL=http://localhost:8080
NEXT_PUBLIC_ECOBE_API_URL=http://localhost:8080/api/v1
```

## 📊 Performance Characteristics

### Build Times
- **CI Pipeline**: ~2-3 minutes
- **Smoke Test**: ~1 minute
- **Security Scan**: ~30 seconds

### Resource Usage
- **Standard GitHub runners**: 2x CPU, 4GB RAM
- **Dependency caching**: Enabled for faster builds
- **Parallel execution**: Jobs run in parallel where possible

## 🔄 Maintenance

### Workflow Updates
- Review quarterly for optimization
- Update Node.js version annually
- Add new validation rules as needed
- Monitor for deprecated GitHub Actions

### Monitoring
- Check workflow success rates monthly
- Review build performance trends
- Update security scanning rules
- Validate smoke test reliability

## 🎯 Success Metrics

### Quality Metrics
- **Build Success Rate**: >95%
- **Type Safety**: 100% coverage
- **Code Quality**: Zero ESLint violations
- **Brand Consistency**: 100% compliance

### Performance Metrics
- **Build Time**: <3 minutes
- **Smoke Test Time**: <1 minute
- **API Response**: <2 seconds
- **Page Load**: <5 seconds

---

## 🚀 Getting Started

1. **Enable Branch Protection**: Configure main branch with required status checks
2. **Add Workflow**: CI workflow is ready to use
3. **Configure Environment**: Set up production environment variables
4. **Monitor Results**: Check Actions tab for workflow results

The CO₂Router dashboard now has robust CI/CD that prevents broken frontend builds and branding issues from reaching production! 🌱
