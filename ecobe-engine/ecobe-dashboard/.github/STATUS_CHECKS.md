# CO₂Router Dashboard - Required Status Checks

## 🛡️ Branch Protection Configuration

### Main Branch Protection Settings
```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "ci"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "require_up_to_date_branch": true,
  "restrictions": null
}
```

## ✅ Required Status Checks

### Core CI Check
- **`ci`** (from `.github/workflows/ci.yml`)
  - TypeScript compilation
  - ESLint validation
  - Production build
  - Frontend structure validation
  - Route/import validation
  - API client validation
  - Branding consistency check

### Optional but Recommended
- **`smoke-test`** (from `.github/workflows/ci.yml`)
  - Dashboard load testing
  - API proxy validation
  - Server startup validation

## 🔧 GitHub Repository Settings

### Branch Protection Rules
1. **Enable branch protection** for `main` branch
2. **Require status checks to pass** before merging
3. **Require up-to-date branches** before merging
4. **Do not allow force pushes**
5. **Include administrators** in branch protection

### Required Checks Selection
In GitHub repository settings → Branches → Branch protection rules:

✅ **Require status checks to pass before merging**
- Select: `ci`

✅ **Require branches to be up to date before merging**
- Ensures PRs include latest main branch changes

✅ **Require pull request reviews before merging**
- Minimum 1 approving review

## 🚨 What These Checks Prevent

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
- ❌ Reintroduction of "Electricity Maps" references
- ❌ Inconsistent CO₂Router branding
- ❌ Public-facing copy issues

### Code Quality Issues
- ❌ Debug statements in production
- ❌ Broken imports/exports
- ❌ Poor code organization

## 📊 Check Details

### `ci` Check (2-3 minutes)
- Installs dependencies with caching
- Runs TypeScript compiler
- Executes ESLint
- Builds production artifacts
- Validates frontend structure
- Checks route imports
- Validates API client modules
- Checks branding consistency
- Validates environment configuration
- Checks for debug statements

### `smoke-test` Check (1 minute) - Optional
- Starts production build server
- Tests dashboard load
- Validates DKS integration page
- Tests API proxy endpoints
- Checks server responsiveness

## 🔍 Troubleshooting

### Common Failures

#### Type Errors
```
Error: TypeScript compilation failed
Fix: Check TypeScript errors in PR, run `npm run type-check`
```

#### Lint Errors
```
Error: ESLint found violations
Fix: Run `npm run lint` and fix reported issues
```

#### Build Failures
```
Error: Production build failed
Fix: Check build logs, resolve compilation issues
```

#### Import Errors
```
Error: Route imports failed
Fix: Check imports in affected route files
```

#### Branding Issues
```
Error: Found banned provider references
Fix: Remove "Electricity Maps" references, use "Carbon Signal Provider"
```

### Quick Fixes
1. **Type errors**: `npm run type-check` locally
2. **Lint issues**: `npm run lint` and fix
3. **Build issues**: `npm run build` locally
4. **Import issues**: Check component imports
5. **Branding issues**: Search for banned references

## 🎯 Success Criteria

### Pull Request Ready When:
- ✅ Required status checks pass
- ✅ No TypeScript errors
- ✅ No ESLint violations
- ✅ Frontend builds successfully
- ✅ API client modules work
- ✅ Branding is consistent
- ✅ Tests pass locally

### Deployment Ready When:
- ✅ All required checks pass on main branch
- ✅ Production build succeeds
- ✅ Dashboard loads correctly
- ✅ API endpoints respond

## 📋 Implementation Checklist

### Repository Setup
- [ ] Enable branch protection for main branch
- [ ] Configure required status checks
- [ ] Enable pull request reviews
- [ ] Set up to-date branch requirement
- [ ] Add administrators to protection rules

### Workflow Verification
- [ ] Test workflow on a sample PR
- [ ] Verify all checks run correctly
- [ ] Check error messages are helpful
- [ ] Validate timing is reasonable
- [ ] Confirm no false positives

### Team Training
- [ ] Document workflow expectations
- [ ] Train team on frontend validation
- [ ] Share quick fix commands
- [ ] Explain branding requirements
- [ ] Provide escalation path

---

## 🚀 Next Steps

1. **Apply these settings** in GitHub repository
2. **Test with a sample PR** to verify everything works
3. **Monitor first week** for any issues
4. **Adjust as needed** based on team feedback

The CO₂Router dashboard now has robust protection against broken frontend builds and branding issues! 🌱
