import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import SignIn from "@/pages/sign-in";
import Compose from "@/pages/compose";
import Wall from "@/pages/wall";
import Tribute from "@/pages/tribute";
import Create from "@/pages/create";
import Dashboard from "@/pages/dashboard";
import Manage from "@/pages/manage";
import MapPage from "@/pages/map";
import Present from "@/pages/present";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Immersive fullscreen presentation — rendered WITHOUT the site chrome */}
      <Route path="/:slug/present" component={Present} />
      {/* Everything else lives inside the standard layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/sign-in" component={SignIn} />
            <Route path="/create" component={Create} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/:slug/wall" component={Wall} />
            <Route path="/:slug/compose" component={Compose} />
            <Route path="/:slug/map" component={MapPage} />
            <Route path="/:slug/manage" component={Manage} />
            <Route path="/:slug/tribute/:id" component={Tribute} />
            <Route path="/:slug" component={Home} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
