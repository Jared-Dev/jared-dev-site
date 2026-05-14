import type { Metadata } from "next";
import {
  Anchor,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ContactReveal } from "@/components/ContactReveal";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Jared Malcolm. Anti-scraping gated reveal.",
  robots: {
    index: true,
    follow: false,
  },
};

export default function ContactPage() {
  return (
    <Container size="sm" py={{ base: 40, md: 80 }}>
      <Stack gap={32}>
        <Group justify="space-between" wrap="nowrap">
          <Anchor href="/" size="sm" c="dimmed">
            ← Back
          </Anchor>
          <Anchor href="/recommendation" size="sm" c="dimmed">
            Letter of recommendation
          </Anchor>
        </Group>

        <Stack gap="xs">
          <Text size="sm" c="dimmed" fw={500} tt="uppercase">
            Get in touch
          </Text>
          <Title order={1} size="h2">
            Contact Jared
          </Title>
          <Text c="dimmed">
            Email and phone aren&apos;t in the page HTML. They&apos;re gated
            so recruiters get them and scrapers don&apos;t. Clear the
            verification below and they appear.
          </Text>
        </Stack>

        <ContactReveal />

        <Text size="sm" c="dimmed">
          Based in Joplin, MO (Central Time). Remote-first; open to hybrid
          case-by-case.
        </Text>
      </Stack>
    </Container>
  );
}
