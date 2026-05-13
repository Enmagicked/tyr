// M9.5: builder types — shared between the API route, the LLM generator,
// the renderer, and the DB column. Kept in a leaf module so the lockfile
// drift test can import it without pulling SDK transitively.

export interface BuilderInputExperience {
  role: string
  org: string
  dates?: string
  location?: string
  description: string  // free-text from user — what they did
}

export interface BuilderInputProject {
  name: string
  tech?: string
  link?: string
  description: string
}

export interface BuilderInputEducation {
  school: string
  degree?: string
  field?: string
  graduation?: string
  gpa?: string
  coursework?: string
  honors?: string
}

export interface BuilderInputActivity {
  name: string
  role?: string
  dates?: string
  description: string
}

export interface BuilderInput {
  contact: {
    name: string
    email: string
    phone?: string
    location?: string
    links?: string  // free text: linkedin/github/portfolio, comma- or newline-separated
  }
  education: BuilderInputEducation[]
  experiences: BuilderInputExperience[]
  projects: BuilderInputProject[]
  activities: BuilderInputActivity[]
  skills: string  // free text — "Languages: Python, Go. Tools: ..."
  awards?: string  // free text
}

// What the LLM returns: pre-formatted section headers + per-item header
// strings + bullet arrays. The bullet arrays are addressable for rewrite.
export interface GeneratedResumeItem {
  header: string  // e.g. "Software Engineer Intern · Google · Summer 2024"
  bullets: string[]
}

export interface GeneratedResumeSection {
  heading: string  // e.g. "Experience", "Education", "Projects"
  items: GeneratedResumeItem[]
}

export interface GeneratedResume {
  name: string
  contact_line: string  // single rendered line, e.g. "email · phone · location · linkedin"
  sections: GeneratedResumeSection[]
}
