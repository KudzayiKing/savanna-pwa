import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CoursePage from "./pages/CoursePage";
import CheckoutPage from "./pages/CheckoutPage";
import CreatorStudioPage from "./pages/CreatorStudioPage";
import LearnPage from "./pages/LearnPage";
import LoginPage from "./pages/LoginPage";
import MessagesPage from "./pages/MessagesPage";
import MerchantStudioPage from "./pages/MerchantStudioPage";
import NotFound from "./pages/NotFound";
import OrdersPage from "./pages/OrdersPage";
import PaymentDetailPage from "./pages/PaymentDetailPage";
import PaymentsPage from "./pages/PaymentsPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import ProfilePage from "./pages/ProfilePage";
import PublicProfilePage from "./pages/PublicProfilePage";
import ProductDetailPage from "./pages/ProductDetailPage";
import ShopsPage from "./pages/ShopsPage";
import StorefrontPage from "./pages/StorefrontPage";
import { Redirect, Route, Switch } from "wouter";

function Router() {
  return (
    <Switch>
      <Route path="/home" component={Home} />
      <Route path="/login" component={LoginPage} />
      <Route path="/"><Redirect to="/messages" /></Route>
      <Route path="/messages" component={MessagesPage} />
      <Route path="/shops/manage" component={MerchantStudioPage} />
      <Route path="/shops/:slug/products/:productId" component={ProductDetailPage} />
      <Route path="/shops/:slug" component={StorefrontPage} />
      <Route path="/shops" component={ShopsPage} />
      <Route path="/learn/manage" component={CreatorStudioPage} />
      <Route path="/learn/:slug" component={CoursePage} />
      <Route path="/learn" component={LearnPage} />
      <Route path="/checkout/:subjectType/:subjectId" component={CheckoutPage} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/payments/:paymentIntentId" component={PaymentDetailPage} />
      <Route path="/payments" component={PaymentsPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/people/:userId" component={PublicProfilePage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
