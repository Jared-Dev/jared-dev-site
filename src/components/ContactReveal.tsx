"use client";

import { useCallback, useState } from "react";
import {
  Alert,
  Button,
  CopyButton,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { Turnstile } from "@/components/Turnstile";

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "dev-bypass";
const USE_BYPASS = TURNSTILE_SITE_KEY === "dev-bypass";

type RevealState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "fetching" }
  | { status: "revealed"; email: string; phone: string }
  | { status: "error"; message: string };

export function ContactReveal() {
  const [state, setState] = useState<RevealState>({ status: "idle" });

  const fetchContact = useCallback(async (token: string) => {
    setState({ status: "fetching" });
    try {
      const res = await fetch("/api/contact-reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken: token }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setState({
          status: "error",
          message: data?.error ?? "Reveal failed. Refresh to try again.",
        });
        return;
      }
      const data = (await res.json()) as { email: string; phone: string };
      setState({ status: "revealed", email: data.email, phone: data.phone });
    } catch (err) {
      setState({
        status: "error",
        message: `Network error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }, []);

  const handleVerify = useCallback(
    (token: string) => {
      setState({ status: "verifying" });
      void fetchContact(token);
    },
    [fetchContact],
  );

  const handleDevBypassClick = () => {
    handleVerify("dev-bypass");
  };

  if (state.status === "revealed") {
    return (
      <Paper withBorder radius="md" p="lg">
        <Stack gap="md">
          <Stack gap={4}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Email
            </Text>
            <Group gap="sm" wrap="nowrap" align="center">
              <Text size="lg" fw={600}>
                {state.email}
              </Text>
              <CopyButton value={state.email} timeout={2000}>
                {({ copied, copy }) => (
                  <Button variant="subtle" size="xs" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
              <Button
                component="a"
                href={`mailto:${state.email}`}
                variant="default"
                size="xs"
              >
                Open
              </Button>
            </Group>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Phone (Central Time)
            </Text>
            <Group gap="sm" wrap="nowrap" align="center">
              <Text size="lg" fw={600}>
                {state.phone}
              </Text>
              <CopyButton value={state.phone} timeout={2000}>
                {({ copied, copy }) => (
                  <Button variant="subtle" size="xs" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
              <Button
                component="a"
                href={`tel:${state.phone.replace(/[^+\d]/g, "")}`}
                variant="default"
                size="xs"
              >
                Call
              </Button>
            </Group>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="md" p="lg">
      <Stack gap="md">
        <Text>
          Quick anti-scraping gate. Clear the check below and the contact
          details show up.
        </Text>

        {USE_BYPASS ? (
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              Turnstile bypass active (dev mode)
            </Text>
            <Button onClick={handleDevBypassClick}>
              Reveal contact
            </Button>
          </Group>
        ) : (
          <Turnstile siteKey={TURNSTILE_SITE_KEY} onVerify={handleVerify} />
        )}

        {(state.status === "verifying" || state.status === "fetching") && (
          <Group gap="sm">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              {state.status === "verifying" ? "Verifying…" : "Revealing…"}
            </Text>
          </Group>
        )}

        {state.status === "error" && (
          <Alert color="red" variant="light" radius="md">
            <Text size="sm">{state.message}</Text>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
