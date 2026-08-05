"use client";

import AppShell from "../components/layout/AppShell";

import MissionControl from "../components/dashboard/MissionControl";
import MissionCard from "../components/dashboard/MissionCard";
import DigitalEmployee from "../components/dashboard/DigitalEmployee";
import QuickActions from "../components/dashboard/QuickActions";
import ActivityTimeline from "../components/dashboard/ActivityTimeline";
import Page from "../components/ui/page";

import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

export default function PlaygroundPage() {
  return (
    <AppShell>
      <Page>

        <MissionControl />

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4">
            <MissionCard />
          </div>

          <div className="col-span-8">
            <DigitalEmployee />
          </div>
        </div>

        <QuickActions />

        <ActivityTimeline />

      </Page>
    </AppShell>
  );
}