"use client";

import AppShell from "./components/layout/AppShell";
import Page from "./components/ui/Page";

import Hero from "./components/headquarters/Hero";

export default function Home() {
  return (
    <AppShell>
      <Page>

        <Hero />

      </Page>
    </AppShell>
  );
}