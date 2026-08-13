"use client";

import Link from "next/link";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface UpgradeModalProps {
    open: boolean;
    onClose: () => void;
    description?: string;
}

export function UpgradeModal({ open, onClose, description }: UpgradeModalProps) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-semibold text-primary">
                        Unlock the full review inbox
                    </DialogTitle>
                    <DialogDescription className="text-base pt-2">
                        {description || "The full plan adds unlimited reply drafts, review sync, and posting to Google. Start your free trial — your data stays exactly where it is."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-4">
                    <div className="space-y-2 rounded-2xl border-[1.5px] border-border bg-tint-butter p-4">
                        <h3 className="font-medium text-primary">What you&apos;ll get:</h3>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            <li>✓ Unlimited reply drafts</li>
                            <li>✓ Post replies to Google</li>
                            <li>✓ Sync reviews from all locations</li>
                            <li>✓ Connect your Google Business Profile</li>
                            <li>✓ 14-day free trial · No card required · Cancel anytime</li>
                        </ul>
                    </div>

                    <div className="flex gap-3">
                        <Link href="/dashboard/billing" className="flex-1">
                            <Button className="w-full">Start free trial</Button>
                        </Link>
                        <Button onClick={onClose}>Maybe later</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
