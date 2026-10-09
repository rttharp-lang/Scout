// Home Court — local NBA fandom intelligence for Nike Basketball.
// Routes: #/ (markets), #/m/<team> (one market), #/league, #/opportunities, #/calendar, #/compare[/<a,b,c>], #/agents[/<team>]
import React, { useEffect } from "react";
import { useRoute, Header, Footer } from "./ui.jsx";
import Overview from "./pages/Overview.jsx";
import League from "./pages/League.jsx";
import Market from "./pages/Market.jsx";
import Calendar from "./pages/Calendar.jsx";
import Agents from "./pages/Agents.jsx";
import Opportunities from "./pages/Opportunities.jsx";
import Compare from "./pages/Compare.jsx";
import { TEAM_BY_ID, teamLabel } from "./teams.js";

export default function App() {
  const route = useRoute();
  const [section, arg] = route;

  useEffect(() => {
    const t = section === "m" && TEAM_BY_ID[arg];
    document.title = t ? `${teamLabel(t)} · Home Court` : section === "league" ? "League read · Home Court" : section === "calendar" ? "League calendar · Home Court" : section === "opportunities" ? "Opportunity board · Home Court" : section === "compare" ? "Compare markets · Home Court" : section === "agents" ? "Agents · Home Court" : "Home Court · Scout";
    if (section !== "m") window.scrollTo(0, 0);
  }, [section, arg]);

  let page;
  if (section === "m") page = <Market id={arg} />;
  else if (section === "league") page = <League />;
  else if (section === "calendar") page = <Calendar />;
  else if (section === "opportunities") page = <Opportunities />;
  else if (section === "compare") page = <Compare ids={arg} />;
  else if (section === "agents") page = <Agents preselect={arg} />;
  else page = <Overview />;

  return (
    <div className="hc hc-wrap">
      <Header route={route} />
      <main>{page}</main>
      <Footer />
    </div>
  );
}
