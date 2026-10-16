"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createExtensionToken, revokeExtensionToken } from "@/server/actions/extension-actions";
import type { ExtensionTokenSummary } from "@/modules/extension/token-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

function formatWhen(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

export function BrowserExtensionPanel({
  schemaReady,
  tokens,
}: {
  schemaReady: boolean;
  tokens: ExtensionTokenSummary[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Browser extension</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The Chrome extension fills Greenhouse, Lever, Ashby, and Workday applications from this
          profile and from answers you already prepared. It can also save a posting to the tracker.
          You review every page and submit it yourself. The extension never clicks Submit or moves
          past a final review step.
        </p>
        {schemaReady ? (
          <>
            <p className="text-sm text-muted-foreground">
              Create a token, paste it into the extension, and store it there. Tokens expire after
              14 days and can be revoked here. Only a hash is kept on the server. The token can
              read your application profile and prepared answers, and write tracker entries.
            </p>
            {freshToken ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                <p className="text-sm font-medium">Copy this token now. It will not be shown again.</p>
                <code className="block break-all text-xs">{freshToken}</code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(freshToken).then(() => {
                      toast({ title: "Token copied" });
                    });
                  }}
                >
                  Copy token
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              loading={pending === "create"}
              onClick={() => {
                setPending("create");
                createExtensionToken()
                  .then((result) => {
                    setFreshToken(result.token);
                    toast({ title: "Extension token created" });
                    router.refresh();
                  })
                  .catch((error: unknown) => {
                    toast({
                      title: "Could not create a token",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    });
                  })
                  .finally(() => setPending(null));
              }}
            >
              Create extension token
            </Button>
            {tokens.length > 0 ? (
              <ul className="space-y-2">
                {tokens.map((token) => {
                  const revoked = Boolean(token.revokedAt);
                  const expired = new Date(token.expiresAt).getTime() <= Date.now();
                  return (
                    <li key={token.id} className="rounded-md border border-border p-3 text-sm">
                      <p className="font-medium">
                        {token.prefix}…{" "}
                        <span className="font-normal text-muted-foreground">
                          {revoked ? "Revoked" : expired ? "Expired" : "Active"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatWhen(token.createdAt)} · Expires {formatWhen(token.expiresAt)} ·
                        Last used {formatWhen(token.lastUsedAt)}
                      </p>
                      {revoked ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          loading={pending === token.id}
                          onClick={() => {
                            setPending(token.id);
                            revokeExtensionToken(token.id)
                              .then(() => {
                                if (freshToken?.startsWith(token.prefix)) setFreshToken(null);
                                toast({ title: "Extension token revoked" });
                                router.refresh();
                              })
                              .catch((error: unknown) => {
                                toast({
                                  title: "Could not revoke the token",
                                  description: error instanceof Error ? error.message : "Unknown error",
                                  variant: "destructive",
                                });
                              })
                              .finally(() => setPending(null));
                          }}
                        >
                          Revoke
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No extension tokens yet.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Apply <code>drizzle/migrations/0020_extension_tokens.sql</code> in the Supabase SQL editor
            before linking the browser extension. Do not merge until that migration is applied.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
