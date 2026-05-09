import Link from "next/link";

import { DashboardPage } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_REGISTRY } from "@/lib/agents/registry";

export default function DashboardPageRoute() {
  return (
    <DashboardPage width="lg" className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Ornigami</h1>
        <p className="text-sm text-foreground">Manage your AI agents for local business growth.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {AGENT_REGISTRY.map((agent) => {
          const isActive = agent.status === "active";
          const hasRoute = agent.id !== "speed_to_lead";

          return (
            <Card key={agent.id} className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{agent.name}</CardTitle>
                  <Badge variant={isActive ? "default" : "secondary"}>
                    {isActive ? "Active" : "Coming soon"}
                  </Badge>
                </div>
                <CardDescription>{agent.shortDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                {hasRoute ? (
                  <Button asChild variant={isActive ? "default" : "outline"}>
                    <Link href={agent.basePath}>
                      {isActive ? "Open agent" : "View placeholder"}
                    </Link>
                  </Button>
                ) : (
                  <Button disabled variant="outline">
                    Coming soon
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DashboardPage>
  );
}
