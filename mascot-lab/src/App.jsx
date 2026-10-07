// Mascot Lab — app shell: providers, bare-hash router, sticky translucent header
// (wordmark, 3-step progress tabs, team pill), page outlet (enter animation + error
// boundary), quiet footer.
import React, { useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "./state/store.jsx";
import { useLogoCanvas } from "./state/useLogoCanvas.js";
import { COPY, CONTACT_EMAIL, LEGAL_LINE, PAGE_TITLES, ROUTE_STEP, SUPPORT_HOURS, TAGLINE } from "./brand.js";
import { AlertTriangle } from "lucide-react";
import {
  Button, ConfirmProvider, CopyText, Notice, StepNav, TeamChip, ThemeSwitch, ToastProvider, Wordmark, cx, useRoute,
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
          <div className="ml-page">
            <Page />
          </div>
        </PageBoundary>
      </main>
      <Footer />
    </div>
  );
}

/** true once the page has scrolled past the top (the header shows its hairline). */
function useScrolled(threshold = 2) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const read = () => { raf = 0; setScrolled(window.scrollY > threshold); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [threshold]);
  return scrolled;
}

function Header({ route }) {
  const { state } = useStore();
  const logo = useLogoCanvas();
  const scrolled = useScrolled();
  // #done only completes the flow once an order actually went out (artifact db or the
  // order endpoint). Before that — nothing submitted, or only saved on this device with
  // "one step left: email it" — it is still the order step.
  const sent = state.order?.status === "submitted" && !!state.order.channel && state.order.channel !== "local";
  const step = route === "done" && !sent ? ROUTE_STEP.order : ROUTE_STEP[route] ?? 0;
  return (
    <header className={cx("ml-header", scrolled && "is-scrolled")}>
      <div className="ml-header__inner">
        <div className="ml-header__brand">
          <Wordmark />
        </div>
        <StepNav current={step} className="ml-header__steps" />
        <div className="ml-header__end">
          <StepNav current={step} variant="compact" className="ml-header__compact" />
          <TeamChip
            className="ml-header__team"
            team={state.team}
            palette={state.palette}
            logoCanvas={logo.status === "error" ? null : logo.canvas}
            logoSrc={logo.status === "error" ? null : state.logo.src}
            status={logo.status}
            sampleLabel={COPY.sampleTag}
            errorLabel={COPY.logoFailedTag}
            href="#studio"
            title={logo.status === "error" ? COPY.logoFailedTitle : "Edit logo and colors"}
          />
        </div>
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
      <div className="container">
        <div className="ml-footer__top">
          <div className="ml-footer__brand">
            <Wordmark size="sm" href={null} />
            <p>{TAGLINE}</p>
          </div>
          <div className="ml-footer__contact">
            <span className="ml-footer__label">{COPY.contactLabel}</span>
            {/* selectable text + copy: mailto links do nothing inside the claude.ai frame */}
            <CopyText text={CONTACT_EMAIL} label="Copy" mono={false} className="ml-footer__email" />
            <span>{SUPPORT_HOURS}</span>
          </div>
        </div>
        <p className="ml-footer__note">{COPY.footerNote} {COPY.privacy}</p>
        <div className="ml-footer__base">
          <span>{LEGAL_LINE} · {COPY.footerSample}</span>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
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
      <div className="container ml-crash-wrap">
        <section className="ml-empty ml-empty--error ml-crash" role="alert">
          <span className="ml-empty__icon"><AlertTriangle aria-hidden="true" /></span>
          <h1 className="ml-empty__title">This page hit a snag</h1>
          <p className="ml-empty__text">Your team, logo and order details are saved. Try the page again, or head back to the start.</p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <div className="ml-empty__actions">
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button variant="secondary" href="#home">Back to start</Button>
          </div>
        </section>
      </div>
    );
  }
}
