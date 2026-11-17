/**
 * Skill taxonomy + extraction.
 *
 * Deliberately small and explicit: every canonical skill lists the aliases that count as a mention.
 * Matching is case-insensitive with custom boundaries so "Java" does not match "JavaScript" and
 * "Go" only matches as a standalone language mention.
 */

export type SkillCategory =
  | "language"
  | "frontend"
  | "backend"
  | "database"
  | "cloud"
  | "devops"
  | "ai"
  | "testing"
  | "practice";

interface SkillDef {
  name: string;
  category: SkillCategory;
  aliases: string[];
}

const SKILLS: SkillDef[] = [
  // Languages
  { name: "Python", category: "language", aliases: ["python"] },
  { name: "JavaScript", category: "language", aliases: ["javascript", "ecmascript", "es6"] },
  { name: "TypeScript", category: "language", aliases: ["typescript"] },
  { name: "Java", category: "language", aliases: ["java"] },
  { name: "C#", category: "language", aliases: ["c#", "csharp"] },
  { name: "C++", category: "language", aliases: ["c++", "cpp"] },
  { name: "Go", category: "language", aliases: ["golang", "go lang"] },
  { name: "Ruby", category: "language", aliases: ["ruby"] },
  { name: "PHP", category: "language", aliases: ["php"] },
  { name: "Kotlin", category: "language", aliases: ["kotlin"] },
  { name: "Swift", category: "language", aliases: ["swift"] },
  { name: "Rust", category: "language", aliases: ["rust"] },
  { name: "Scala", category: "language", aliases: ["scala"] },
  { name: "SQL", category: "database", aliases: ["sql"] },
  { name: "HTML", category: "frontend", aliases: ["html", "html5"] },
  { name: "CSS", category: "frontend", aliases: ["css", "css3", "sass", "scss"] },
  { name: "Bash", category: "devops", aliases: ["bash", "shell scripting"] },

  // Frontend
  { name: "React", category: "frontend", aliases: ["react", "react.js", "reactjs"] },
  { name: "Next.js", category: "frontend", aliases: ["next.js", "nextjs"] },
  { name: "Angular", category: "frontend", aliases: ["angular", "angularjs"] },
  { name: "Vue", category: "frontend", aliases: ["vue", "vue.js", "vuejs"] },
  { name: "Redux", category: "frontend", aliases: ["redux"] },
  { name: "Tailwind CSS", category: "frontend", aliases: ["tailwind", "tailwindcss"] },
  { name: "React Native", category: "frontend", aliases: ["react native"] },

  // Backend
  { name: "Node.js", category: "backend", aliases: ["node.js", "nodejs", "node"] },
  { name: "Express", category: "backend", aliases: ["express", "express.js", "expressjs"] },
  { name: "NestJS", category: "backend", aliases: ["nestjs", "nest.js"] },
  { name: "Django", category: "backend", aliases: ["django"] },
  { name: "Flask", category: "backend", aliases: ["flask"] },
  { name: "FastAPI", category: "backend", aliases: ["fastapi"] },
  { name: "Spring", category: "backend", aliases: ["spring boot", "spring"] },
  { name: ".NET", category: "backend", aliases: [".net", "dotnet", "asp.net"] },
  { name: "Ruby on Rails", category: "backend", aliases: ["rails", "ruby on rails"] },
  { name: "REST APIs", category: "backend", aliases: ["rest", "restful", "rest api", "rest apis"] },
  { name: "GraphQL", category: "backend", aliases: ["graphql"] },
  { name: "gRPC", category: "backend", aliases: ["grpc"] },
  { name: "Microservices", category: "backend", aliases: ["microservices", "microservice"] },
  { name: "JWT", category: "backend", aliases: ["jwt", "json web token", "json web tokens"] },
  { name: "OAuth", category: "backend", aliases: ["oauth", "oauth2", "openid connect", "oidc"] },
  { name: "Kafka", category: "backend", aliases: ["kafka"] },
  { name: "RabbitMQ", category: "backend", aliases: ["rabbitmq"] },

  // Databases
  { name: "PostgreSQL", category: "database", aliases: ["postgresql", "postgres"] },
  { name: "MySQL", category: "database", aliases: ["mysql"] },
  { name: "MongoDB", category: "database", aliases: ["mongodb", "mongo"] },
  { name: "Redis", category: "database", aliases: ["redis"] },
  { name: "DynamoDB", category: "database", aliases: ["dynamodb"] },
  { name: "Supabase", category: "database", aliases: ["supabase"] },
  { name: "Elasticsearch", category: "database", aliases: ["elasticsearch", "opensearch"] },
  { name: "Snowflake", category: "database", aliases: ["snowflake"] },

  // Cloud
  { name: "AWS", category: "cloud", aliases: ["aws", "amazon web services"] },
  { name: "Amazon S3", category: "cloud", aliases: ["s3", "amazon s3", "aws s3"] },
  { name: "AWS Lambda", category: "cloud", aliases: ["lambda", "aws lambda"] },
  { name: "Amazon EC2", category: "cloud", aliases: ["ec2", "amazon ec2"] },
  { name: "Azure", category: "cloud", aliases: ["azure", "microsoft azure"] },
  { name: "GCP", category: "cloud", aliases: ["gcp", "google cloud", "google cloud platform"] },
  { name: "Serverless", category: "cloud", aliases: ["serverless"] },
  { name: "Vercel", category: "cloud", aliases: ["vercel"] },

  // DevOps
  { name: "Docker", category: "devops", aliases: ["docker", "containers", "containerization"] },
  { name: "Kubernetes", category: "devops", aliases: ["kubernetes", "k8s", "eks", "gke", "aks"] },
  { name: "Terraform", category: "devops", aliases: ["terraform"] },
  { name: "CI/CD", category: "devops", aliases: ["ci/cd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"] },
  { name: "GitHub Actions", category: "devops", aliases: ["github actions"] },
  { name: "Jenkins", category: "devops", aliases: ["jenkins"] },
  { name: "Git", category: "devops", aliases: ["git", "github", "gitlab"] },
  { name: "Linux", category: "devops", aliases: ["linux", "unix"] },
  { name: "Ansible", category: "devops", aliases: ["ansible"] },
  { name: "Prometheus", category: "devops", aliases: ["prometheus", "grafana"] },
  { name: "Datadog", category: "devops", aliases: ["datadog"] },

  // AI
  { name: "OpenAI API", category: "ai", aliases: ["openai", "openai api", "gpt-4", "gpt-4o", "chatgpt"] },
  { name: "LLMs", category: "ai", aliases: ["llm", "llms", "large language model", "large language models", "generative ai", "genai"] },
  { name: "LangChain", category: "ai", aliases: ["langchain", "langgraph"] },
  { name: "RAG", category: "ai", aliases: ["rag", "retrieval augmented generation", "retrieval-augmented generation"] },
  { name: "Prompt Engineering", category: "ai", aliases: ["prompt engineering"] },
  { name: "Vector Databases", category: "ai", aliases: ["vector database", "vector databases", "pgvector", "pinecone", "weaviate"] },
  { name: "Machine Learning", category: "ai", aliases: ["machine learning", "ml"] },
  { name: "PyTorch", category: "ai", aliases: ["pytorch"] },
  { name: "TensorFlow", category: "ai", aliases: ["tensorflow"] },

  // Testing
  { name: "Jest", category: "testing", aliases: ["jest"] },
  { name: "Cypress", category: "testing", aliases: ["cypress"] },
  { name: "Playwright", category: "testing", aliases: ["playwright"] },
  { name: "pytest", category: "testing", aliases: ["pytest"] },
  { name: "Unit Testing", category: "testing", aliases: ["unit testing", "unit tests", "test-driven development", "tdd"] },

  // Practices
  { name: "Agile", category: "practice", aliases: ["agile", "scrum", "kanban"] },
  { name: "System Design", category: "practice", aliases: ["system design", "distributed systems"] },
  { name: "Data Structures & Algorithms", category: "practice", aliases: ["data structures", "algorithms"] },
];

const SKILL_BY_NAME = new Map(SKILLS.map((s) => [s.name.toLowerCase(), s]));

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Boundaries: a mention must not be glued to letters/digits/+/#. A trailing "." is allowed so
 * "Node." at a sentence end matches, but "node.js" is handled by its own alias.
 */
/** Aliases that are ordinary English words; only count them when another tech skill is nearby. */
const AMBIGUOUS_ALIASES = new Set([
  "express", "spring", "swift", "rust", "node", "rest", "lambda", "containers", "ml", "rag",
  "agile", "kanban", "rails", "snowflake", "unix",
]);

const ALIAS_PATTERNS: { skill: SkillDef; alias: string; ambiguous: boolean; re: RegExp; test: RegExp }[] =
  SKILLS.flatMap((skill) =>
    skill.aliases.map((alias) => ({
      skill,
      alias,
      ambiguous: AMBIGUOUS_ALIASES.has(alias),
      re: new RegExp(`(?<![a-z0-9+#.])${escapeRegex(alias)}(?![a-z0-9+#]|\\.[a-z])`, "gi"),
      test: new RegExp(`(?<![a-z0-9+#.])${escapeRegex(alias)}(?![a-z0-9+#]|\\.[a-z])`, "i"),
    }))
  );

export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const { skill, ambiguous, re } of ALIAS_PATTERNS) {
    if (found.has(skill.name)) continue;
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (!ambiguous || hasTechNeighbour(text, match.index, match[0].length)) {
        found.add(skill.name);
        break;
      }
    }
  }
  return [...found];
}

/** True when an unambiguous skill alias appears within ~60 characters of the mention. */
function hasTechNeighbour(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 60), index);
  const after = text.slice(index + length, index + length + 60);
  const window = `${before} | ${after}`;
  return ALIAS_PATTERNS.some(({ ambiguous, test }) => !ambiguous && test.test(window));
}

export function canonicalSkill(name: string): string | null {
  const direct = SKILL_BY_NAME.get(name.trim().toLowerCase());
  if (direct) return direct.name;
  const extracted = extractSkills(name);
  return extracted.length === 1 ? extracted[0] : null;
}

export function skillCategory(name: string): SkillCategory | null {
  return SKILL_BY_NAME.get(name.toLowerCase())?.category ?? null;
}

/** Skills implied by a more specific skill (e.g. knowing Amazon S3 implies AWS exposure). */
const IMPLIES: Record<string, string[]> = {
  "Amazon S3": ["AWS"],
  "AWS Lambda": ["AWS", "Serverless"],
  "Amazon EC2": ["AWS"],
  DynamoDB: ["AWS"],
  TypeScript: ["JavaScript"],
  "Next.js": ["React"],
  Express: ["Node.js"],
  NestJS: ["Node.js"],
  Supabase: ["PostgreSQL"],
  PostgreSQL: ["SQL"],
  MySQL: ["SQL"],
  "OpenAI API": ["LLMs"],
};

export function expandImpliedSkills(skills: Iterable<string>): Set<string> {
  const out = new Set<string>(skills);
  for (const s of [...out]) for (const implied of IMPLIES[s] ?? []) out.add(implied);
  return out;
}

// --- Requirement sectioning -------------------------------------------------------------------

const PREFERRED_HEADING =
  /(nice[- ]to[- ]have|bonus|preferred|pluses?|a plus|good to have|desirable|extra credit|asset)/i;
const REQUIRED_HEADING =
  /(requirements?|qualifications?|must[- ]haves?|what you(?:'|’)?ll (?:need|bring)|what we(?:'|’)?re looking for|who you are|about you|you have|skills|experience)/i;
const RESPONSIBILITY_HEADING =
  /(responsibilit|what you(?:'|’)?ll do|the role|day[- ]to[- ]day|in this role|your impact|what you will do|you will)/i;

export interface JobSections {
  required: string;
  preferred: string;
  responsibilities: string;
  other: string;
}

/**
 * Split description text into sections by heading-like lines. Lines that mention "preferred" /
 * "bonus" inline (e.g. "Experience with Go is a plus") are routed to preferred even inside a
 * requirements block.
 */
export function splitSections(text: string): JobSections {
  const sections: JobSections = { required: "", preferred: "", responsibilities: "", other: "" };
  let current: keyof JobSections = "other";

  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const isHeading = line.length <= 80 && !/[.;]$/.test(line) && line.split(/\s+/).length <= 10;
    if (isHeading) {
      if (PREFERRED_HEADING.test(line)) current = "preferred";
      else if (RESPONSIBILITY_HEADING.test(line)) current = "responsibilities";
      else if (REQUIRED_HEADING.test(line)) current = "required";
      else if (/^(about us|about the company|benefits|perks|what we offer|compensation|our values|equal opportunity)/i.test(line))
        current = "other";
    }
    const target: keyof JobSections =
      current !== "preferred" && /\b(nice to have|is a plus|a bonus|preferred|bonus points|an asset)\b/i.test(line)
        ? "preferred"
        : current;
    sections[target] += line + "\n";
  }
  return sections;
}

export interface RequirementSkills {
  required: string[];
  preferred: string[];
}

export function extractRequirementSkills(text: string): RequirementSkills {
  const sections = splitSections(text);
  const preferred = new Set(extractSkills(sections.preferred));
  let required = new Set(extractSkills(sections.required + "\n" + sections.responsibilities));

  // No recognisable requirements section: fall back to the whole posting as required.
  if (required.size === 0) required = new Set(extractSkills(text).filter((s) => !preferred.has(s)));

  for (const s of required) preferred.delete(s);
  return { required: [...required], preferred: [...preferred] };
}
