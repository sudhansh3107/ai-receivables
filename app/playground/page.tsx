"use client";

import AppShell from "../components/layout/AppShell";

import ExecutiveBriefing from "../components/dashboard/ExecutiveBriefing";
import MissionCard from "../components/dashboard/MissionCard";
import OrionPanel from "../components/dashboard/OrionPanel";
import QuickActions from "../components/dashboard/QuickActions";
import ActivityTimeline from "../components/dashboard/ActivityTimeline";

import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

export default function PlaygroundPage() {
  return (
    <AppShell>
      <div className="space-y-8">

        <ExecutiveBriefing />

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4">
            <MissionCard />
          </div>

          <div className="col-span-8">
            <OrionPanel />
          </div>
        </div>

        <QuickActions />

        <ActivityTimeline />

        {/* UI Library */}
        <section className="border-t pt-10 space-y-10">
          <div>
            <h2 className="text-2xl font-bold">
              UI Components
            </h2>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold">
              Cards
            </h3>

            <Card>
              <h3 className="text-xl font-semibold">
                Normal Card
              </h3>

              <p className="mt-2 text-slate-600">
                This card remains static.
              </p>
            </Card>

            <Card interactive>
              <h3 className="text-xl font-semibold">
                Interactive Card
              </h3>

              <p className="mt-2 text-slate-600">
                Hover me to see the interaction.
              </p>
            </Card>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold">
              Buttons
            </h3>

            <div className="flex gap-4 flex-wrap">
              <Button>Upload Invoice</Button>

              <Button variant="secondary">
                Cancel
              </Button>

              <Button variant="ghost">
                Learn More
              </Button>

              <Button variant="danger">
                Delete
              </Button>
            </div>
          </div>
        </section>

      </div>
    </AppShell>
  );
}