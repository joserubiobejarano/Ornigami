import Link from "next/link";

import { DashboardPage } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPageRoute() {
  return (
    <DashboardPage width="lg" className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Ornigami</h1>
        <p className="text-sm text-foreground">Manage your AI agents for local business growth.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Review Replies</CardTitle>
              <Badge>Active</Badge>
            </div>
            <CardDescription>Handle and respond to your Google reviews.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/agents/review-replies">Open agent</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Review Booster</CardTitle>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
            <CardDescription>Post-visit review request automations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/agents/review-booster">View placeholder</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Speed to Lead</CardTitle>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
            <CardDescription>Lead response and qualification workflows.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled variant="outline">Coming soon</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardPage>
  );
}
