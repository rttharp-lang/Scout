// NBA Fandom — local NBA fandom intelligence for Nike Basketball.
// Routes: #/ (markets), #/m/<team> (one market), #/league, #/opportunities, #/calendar, #/compare[/<a,b,c>], #/method[/<section>], #/agents[/<team>]
import React, { useEffect } from "react";
import { useRoute, Header, Footer } from "./ui.jsx";
import Overview from "./pages/Overview.jsx";
import League from "./pages/League.jsx";
import Market from "./pages/Market.jsx";
import Calendar from "./pages/Calendar.jsx";
import Agents from "./pages/Agents.jsx";
import Opportunities from "./pages/Opportunities.jsx";
import Compare from "./pages/Compare.jsx";
import Method from "./pages/Method.jsx";
import { TEAM_BY_ID, teamLabel } from "./teams.js";

export default function App() {
  const route = useRoute();
  const [section, arg] = route;

  useEffect(() => {
    const t = section === "m" && TEAM_BY_ID[arg];
    document.title = t ? `${teamLabel(t)} · NBA Fandom` : section === "league" ? "League read · NBA Fandom" : section === "calendar" ? "League calendar · NBA Fandom" : section === "opportunities" ? "Opportunity board · NBA Fandom" : section === "compare" ? "Compare markets · NBA Fandom" : section === "method" ? "Method · NBA Fandom" : section === "agents" ? "Agents · NBA Fandom" : "NBA Fandom · Source";
    if (section !== "m" && !(section === "method" && arg)) window.scrollTo(0, 0);
  }, [section, arg]);

  let page;
  if (section === "m") page = <Market id={arg} />;
  else if (section === "league") page = <League />;
  else if (section === "calendar") page = <Calendar />;
  else if (section === "opportunities") page = <Opportunities />;
  else if (section === "compare") page = <Compare ids={arg} />;
  else if (section === "agents") page = <Agents preselect={arg} />;
  else if (section === "method") page = <Method anchor={arg} />;
  else page = <Overview />;

  return (
    <div className="hc hc-wrap">
      <Header route={route} />
      <main>{page}</main>
      <Footer />
    </div>
  );
}
