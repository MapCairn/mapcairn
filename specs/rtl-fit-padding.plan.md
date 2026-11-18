# Right-to-left feature fitting test plan

## Application overview

A person can show a layer feature on the map while the side panel remains open.
The map must fit a polygon in the part not covered by the panel.

## Test scenarios

### Right-to-left side panel

**Seed:** `packages/web/e2e/seed.spec.ts`

#### Polygon clear of the panel

**File:** `packages/web/e2e/rtl.spec.ts`

**Steps:**

1. Open the map with the country layer on and open Map options.
   - expect: the country layer's list is available.
2. Open the list and choose Australia.
   - expect: the Australia feature card is shown.
3. Choose Show on map.
   - expect: the polygon's outline is wholly to the left of the side panel.
