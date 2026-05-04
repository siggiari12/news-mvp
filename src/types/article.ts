export interface Article {
  id: string;
  topic_id?: string;
  title: string;
  excerpt?: string;
  summary?: string;
  image_url?: string;
  published_at: string;
  updated_at?: string;
  article_count?: number;
  full_text?: string;
  url?: string;
  sources?: { name: string };
  category?: string;
  importance?: number;
}
