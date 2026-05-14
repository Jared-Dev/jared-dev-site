import type { Metadata } from "next";
import {
  Anchor,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { RECOMMENDATION, RECOMMENDATION_READY } from "@/lib/profile";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Letter of recommendation",
  description:
    "Letter of recommendation from Mallerie Shirley (Tensure Consulting).",
};

export default function RecommendationPage() {
  return (
    <Container size="md" py={{ base: 40, md: 80 }}>
      <Stack gap={32}>
        <Group justify="space-between" wrap="nowrap">
          <Anchor href="/" size="sm" c="dimmed">
            ← Back
          </Anchor>
          <Anchor href="/contact" size="sm" c="dimmed">
            Contact
          </Anchor>
        </Group>

        <Stack gap="xs">
          <Text size="sm" c="dimmed" fw={500} tt="uppercase">
            Third-party context
          </Text>
          <Title order={1} size="h2">
            Letter of recommendation
          </Title>
          <Text c="dimmed">
            Written by {RECOMMENDATION.recommenderName} ·{" "}
            {RECOMMENDATION.recommenderTitle}
          </Text>
        </Stack>

        {RECOMMENDATION_READY ? (
          <Stack gap="md">
            <Text>{RECOMMENDATION.blurb}</Text>
            <Paper withBorder radius="md" p={0} className={styles.frameWrap}>
              <iframe
                src={RECOMMENDATION.pdfPath}
                title="Letter of recommendation"
                className={styles.frame}
              />
            </Paper>
            <Group>
              <Button component="a" href={RECOMMENDATION.pdfPath} download>
                Download PDF
              </Button>
              <Button component="a" href="/contact" variant="default">
                Reach out to Jared
              </Button>
            </Group>
          </Stack>
        ) : (
          <Paper withBorder radius="md" p="lg">
            <Stack gap="sm">
              <Title order={2} size="h4">
                Coming soon
              </Title>
              <Text>{RECOMMENDATION.blurb}</Text>
              <Group mt="sm">
                <Button component="a" href="/contact">
                  Contact Jared
                </Button>
                <Button component="a" href="/" variant="default">
                  Back to homepage
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
