import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WallpaperProvider } from "./contexts/WallpaperContext";
import MessagesPage from "./pages/MessagesPage";
import NotFound from "./pages/NotFound";
import { Redirect, Route, Switch } from "wouter";

/**
 * Route-level code splitting.
 *
 * The client shipped as one ~1.2 MB chunk holding every screen, most of which
 * a given session never opens — a shopper downloaded the creator studio and
 * vice versa. Splitting per route moves each screen into its own chunk that is
 * fetched on first visit and then cached by the service worker.
 *
 * Two routes stay eager:
 *  - `MessagesPage`, because `/` redirects to `/messages`, so it is on the
 *    critical path of every cold start. Lazily loading it would add a second
 *    round trip before first paint.
 *  - `NotFound`, because it is tiny and can be needed by any bad URL.
 */
const AdminPage = lazy(() => import("./pages/AdminPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const CommunityDetailPage = lazy(() => import("./pages/CommunityDetailPage"));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MerchantStudioPage = lazy(() => import("./pages/MerchantStudioPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const PaymentDetailPage = lazy(() => import("./pages/PaymentDetailPage"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const PublicProfilePage = lazy(() => import("./pages/PublicProfilePage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const RecallPage = lazy(() => import("./pages/RecallPage"));
const ShopsPage = lazy(() => import("./pages/ShopsPage"));
const StorefrontPage = lazy(() => import("./pages/StorefrontPage"));
const StoriesPage = lazy(() => import("./pages/StoriesPage"));

/**
 * Shown while a route chunk downloads.
 *
 * A failed chunk import rejects rather than renders, so it lands in
 * `ErrorBoundary` instead — which is what a user sees after a deploy replaces
 * the chunk hashes while their tab is still open.
 */
function RouteFallback() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/home">
          <Redirect to="/messages" />
        </Route>
        <Route path="/login" component={LoginPage} />
        <Route path="/">
          <Redirect to="/messages" />
        </Route>
        <Route path="/messages" component={MessagesPage} />
        <Route path="/shops/manage" component={MerchantStudioPage} />
        <Route
          path="/shops/:slug/products/:productId"
          component={ProductDetailPage}
        />
        <Route path="/shops/:slug" component={StorefrontPage} />
        <Route path="/shops" component={ShopsPage} />
        <Route path="/stories" component={StoriesPage} />
        <Route
          path="/communities/:communityId"
          component={CommunityDetailPage}
        />
        <Route path="/communities" component={CommunitiesPage} />
        <Route path="/learn/manage">
          <Redirect to="/shops/manage" />
        </Route>
        <Route path="/learn/:slug">
          <Redirect to="/shops" />
        </Route>
        <Route path="/learn">
          <Redirect to="/shops" />
        </Route>
        <Route
          path="/checkout/:subjectType/:subjectId"
          component={CheckoutPage}
        />
        <Route path="/orders" component={OrdersPage} />
        <Route
          path="/payments/:paymentIntentId"
          component={PaymentDetailPage}
        />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/recall" component={RecallPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/people/:userId" component={PublicProfilePage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <WallpaperProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </WallpaperProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
