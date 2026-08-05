"use client";

import AppShell from "./components/layout/AppShell";
import Page from "./components/ui/Page";

import Hero from "./components/headquarters/Hero";
import MissionCard from "./components/headquarters/MissionCard";
import ActivityFeed from "./components/headquarters/ActivityFeed";
import DecisionFeed from "./components/headquarters/DecisionFeed";
import AIInsight from "./components/headquarters/AIInsight";

export default function Home() {
  return (
    <AppShell>
      <Page>

        <Hero />

        <div className="mt-10 grid grid-cols-12 gap-8">

          {/* Left */}

          <div className="col-span-3">
            <MissionCard />
          </div>

          {/* Right */}

          <div className="col-span-9">

            <div className="grid grid-cols-9 gap-6">

              {/* Employee Activity */}

              <div className="col-span-5">
                <ActivityFeed />
              </div>

              {/* Needs Your Decision */}

              <div className="col-span-4">
                <DecisionFeed />
              </div>

              {/* AI Insight */}

              <div className="col-span-9">
                <AIInsight />
              </div>

            </div>

          </div>

        </div>

      </Page>
    </AppShell>
  );
}