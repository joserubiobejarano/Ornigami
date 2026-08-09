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
                    <DialogTitle className="text-2xl font-semibold bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-400 bg-clip-text text-transparent">
                        Unlock the full review inbox
                    </DialogTitle>
                    <DialogDescription className="text-base pt-2">
                        {description || "You&apos;ve reached the demo limit. Start your free trial for unlimited AI reply drafts, review sync, and posting to Google (fair use applies)."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                        <h3 className="font-medium text-slate-900">What you&apos;ll get:</h3>
                        <ul className="text-sm text-slate-600 space-y-1">
                            <li>✓ Unlimited AI reply drafts</li>
                            <li>✓ Post replies to Google</li>
                            <li>✓ Sync reviews from all locations</li>
                            <li>✓ Connect your Google Business Profile</li>
                            <li>✓ 14-day free trial, card required</li>
                        </ul>
                    </div>

                    <div className="flex gap-3">
                        <Link href="/settings#billing" className="flex-1">
                            <Button
                                className="w-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-400 hover:opacity-90"
                            >
                                Start your free trial
                            </Button>
                        </Link>
                        <Button onClick={onClose}>
                            Continue exploring
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
