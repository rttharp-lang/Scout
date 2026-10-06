// Mascot Lab — app shell: providers, bare-hash router, sticky header (wordmark,
// 3-step progress, team chip), page outlet with an error boundary, footer.
import React, { useEffect, useRef } from "react";
import { StoreProvider, useStore } from "./state/store.jsx";
import { useLogoCanvas } from "./state/useLogoCanvas.js";
import { COPY, CONTACT_EMAIL, LEGAL_LINE, PAGE_TITLES, ROUTE_STEP, SUPPORT_HOURS, TAGLINE } from "./brand.js";
import {
  Button, ConfirmProvider, Notice, SpecLabel, StepNav, TeamChip, ThemeSwitch, ToastProvider, Wordmark, useRoute,
} from "./ui/components/index.js";
import "./ui/components/shell.css";

import Landing from "./ui/pages/Landing.jsx";
import Studio from "./ui/pages/Studio.jsx";
import Collection from "./ui/pages/Collection.jsx";
import Order from "./ui/pages/Order.jsx";
import Review from "./ui/pages/Review.jsx";
import Done from "./ui/pages/Done.jsx";
import Orders from "./ui/order/OrdersPage.jsx";

const PAGES = { home: Landing, studio: Studio, collection: Collection, order: Order, review: Review, done: Done, orders: Orders };

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Shell />
        </ConfirmProvider>
      </ToastProvider>
    </StoreProvider>
  );
}

function Shell() {
  const route = useRoute();
  const mainRef = useRef(null);
  const lastRoute = useRef(route);

  // per-route: title, scroll to top, move focus to the page (not on first load;
  // idempotent so StrictMode's double effect run doesn't steal focus)
  useEffect(() => {
    document.title = PAGE_TITLES[route] || PAGE_TITLES.home;
    if (lastRoute.current === route) return;
    lastRoute.current = route;
    window.scrollTo({ top: 0, behavior: "auto" });
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  const Page = PAGES[route] || Landing;
  return (
    <div className="ml-app">
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>Skip to content</button>
      <Header route={route} />
      <LogoNotSavedBanner />
      <main id="main" className="ml-main" ref={mainRef} tabIndex={-1} aria-label={PAGE_TITLES[route]}>
        <PageBoundary key={route} route={route}>
          <Page />
        </PageBoundary>
      </main>
      <Footer />
    </div>
  );
}

function Header({ route }) {
  const { state } = useStore();
  const logo = useLogoCanvas();
  const step = ROUTE_STEP[route] ?? 0;
  return (
    <header className="ml-header">
      <div className="ml-header__inner">
        <div className="ml-header__brand">
          <Wordmark />
        </div>
        <StepNav current={step} className="ml-header__steps" />
        <StepNav current={step} variant="compact" className="ml-header__compact" />
        <TeamChip
          className="ml-header__team"
          team={state.team}
          palette={state.palette}
          logoCanvas={logo.canvas}
          logoSrc={state.logo.src}
          sampleLabel={COPY.sampleTag}
          href="#studio"
          title="Edit logo and colours"
        />
      </div>
    </header>
  );
}

function LogoNotSavedBanner() {
  const { state, actions } = useStore();
  if (!state.flags?.logoNotSaved) return null;
  return (
    <div className="container ml-banner">
      <Notice tone="warning" title="Upload your logo again" onDismiss={() => actions.dismissFlag("logoNotSaved")}>
        {COPY.logoTooBig}
      </Notice>
    </div>
  );
}

function Footer() {
  return (
    <footer className="ml-footer">
      <CourtLines />
      <div className="container">
        <div className="ml-footer__grid">
          <div className="ml-footer__col">
            <Wordmark size="sm" href={null} />
            <p>{TAGLINE}</p>
          </div>
          <div className="ml-footer__col">
            <SpecLabel>Proofs &amp; pricing</SpecLabel>
            <p>{COPY.footerNote}</p>
            <p>{COPY.privacy}</p>
          </div>
          <div className="ml-footer__col">
            <SpecLabel>Orders &amp; questions</SpecLabel>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            <p>{SUPPORT_HOURS}</p>
          </div>
        </div>
        <div className="ml-footer__base">
          <SpecLabel wrap>{LEGAL_LINE} · {COPY.footerSample}</SpecLabel>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}

/** Half-court linework, drawn once, faint — the one place the court motif appears. */
function CourtLines() {
  return (
    <svg className="ml-footer__court" viewBox="0 0 600 360" preserveAspectRatio="xMaxYMid meet" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {/* half court to scale (1 ft = 7.2 units): sidelines, half-court line, centre circle, lane, FT circle, 3-pt line, rim */}
      <path d="M0 1H599V359H0" />
      <path d="M262 1V359" />
      <circle cx="262" cy="180" r="43" />
      <circle cx="262" cy="180" r="14" />
      <path d="M599 122.5H463V237.5H599" />
      <circle cx="463" cy="180" r="43" />
      <path d="M599 21.6H497.6A171 171 0 0 0 497.6 338.4H599" />
      <path d="M571 158V202" />
      <circle cx="562" cy="180" r="5.4" />
    </svg>
  );
}

class PageBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(`[app] ${this.props.route} page crashed:`, error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container ml-crash">
        <SpecLabel variant="warning">Page error</SpecLabel>
        <h2>This page hit a snag.</h2>
        <p className="lead">Your team, logo and order details are saved. Try the page again, or head back to the start.</p>
        <pre>{String(this.state.error?.message || this.state.error)}</pre>
        <div className="cluster">
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          <Button variant="secondary" href="#home">Back to start</Button>
        </div>
      </div>
    );
  }
}
