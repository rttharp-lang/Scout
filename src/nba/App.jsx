// Home Court — local NBA fandom intelligence for Nike Basketball.
// Routes: #/ (markets), #/m/<team> (one market), #/opportunities, #/calendar, #/agents[/<team>]
import React, { useEffect } from "react";
import { useRoute, Header, Footer } from "./ui.jsx";
import Overview from "./pages/Overview.jsx";
import Market from "./pages/Market.jsx";
import Calendar from "./pages/Calendar.jsx";
import Agents from "./pages/Agents.jsx";
import Opportunities from "./pages/Opportunities.jsx";
import { TEAM_BY_ID } from "./teams.js";

export default function App() {
  const route = useRoute();
  const [section, arg] = route;

  useEffect(() => {
    const t = section === "m" && TEAM_BY_ID[arg];
    document.title = t ? `${t.city} ${t.name} · Home Court` : section === "calendar" ? "League calendar · Home Court" : section === "opportunities" ? "Opportunity board · Home Court" : section === "agents" ? "Agents · Home Court" : "Home Court · Scout";
    if (section !== "m") window.scrollTo(0, 0);
  }, [section, arg]);

  let page;
  if (section === "m") page = <Market id={arg} />;
  else if (section === "calendar") page = <Calendar />;
  else if (section === "opportunities") page = <Opportunities />;
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
