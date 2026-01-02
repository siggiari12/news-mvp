import NewsFeed from "@/components/NewsFeed";

export default function Home() {
  // Við sendum engar fréttir héðan. NewsFeed sér um að sækja þær.
  return <NewsFeed initialArticles={[]} />;
}
