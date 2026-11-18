# Language direction test plan

## Application overview

The host sets the document language and reading direction from the active catalogue. A stored offered language also takes effect before the application scripts run.

## Test scenarios

### 1. Stored right-to-left language

**Seed:** `packages/web/e2e/seed.spec.ts`

#### 1.1. stored-right-to-left-language

**File:** `packages/web/e2e/i18n.spec.ts`

**Steps:**

1. Offer a sample right-to-left catalogue and store its tag before loading the map.
   - expect: the document has that language and right-to-left direction before the application scripts run.
