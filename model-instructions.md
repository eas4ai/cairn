# AI Model Instructions for Project Documentation

This document provides guidance for AI models on how to effectively use the documentation templates in this directory to document software projects in a structured, comprehensive manner.

## Documentation Framework Overview

As an AI model, you should use this documentation framework to help users create and maintain high-quality project documentation. The templates in this directory represent a comprehensive approach to documenting all aspects of a software project, from high-level vision to detailed implementation standards.

## When to Use This Framework

Apply this documentation framework when:

1. A user requests help with project documentation
2. You're asked to create documentation for a new project
3. You need to structure information about an existing project
4. A user needs to improve or standardize their documentation approach
5. You're helping plan a new software project

## General Approach to Documentation

When using these templates, follow these principles:

1. **Be Comprehensive Yet Concise**
   - Include all necessary information without unnecessary verbosity
   - Focus on clarity and precision in language
   - Use bullet points and numbered lists for better readability

2. **Maintain Consistency**
   - Use consistent terminology across all documents
   - Maintain consistent formatting and structure
   - Ensure cross-references between documents are accurate

3. **Focus on User Needs**
   - Prioritize information most valuable to the target audience
   - Consider different readers (developers, stakeholders, new team members)
   - Organize information in order of importance

4. **Document Rationale**
   - Explain not just what decisions were made, but why
   - Document alternatives considered and reasons for rejection
   - Capture constraints that influenced decisions

## Documentation Creation Process

### Step 1: Understand the Project Scope

Before starting documentation:
- Gather all available project information
- Understand the project's goals, constraints, and context
- Identify key stakeholders and their documentation needs
- Determine the project's current stage of development

### Step 2: Select Appropriate Templates

Based on project needs:
- For new projects: Start with all templates, focusing first on project-overview
- For existing projects: Prioritize documentation gaps
- For specific requests: Focus on the relevant templates

### Step 3: Populate Templates Methodically

When filling out templates:
- Replace all placeholder text with specific, relevant information
- Maintain the structure provided by the templates
- Adapt sections as needed for the specific project
- Ensure cross-references between documents are maintained

### Step 4: Enhance with Project-Specific Details

After basic template completion:
- Add additional sections as needed for the specific project
- Include relevant examples, diagrams, and code snippets
- Remove sections that don't apply to the specific project
- Customize terminology to match project conventions

## Template-Specific Guidance

### Project Overview

- This is typically the first document to complete
- Focus on clear articulation of vision and problem statement
- Ensure success metrics are specific, measurable, and realistic
- Include a balanced risk assessment

Example approach:
```
When creating the project overview, first establish the core vision in 2-3 
sentences that capture the essence of what the project aims to achieve. 
Then expand on specific problems being solved, ensuring each point is 
concrete rather than abstract. For example, instead of "The current process 
is inefficient," write "The current process requires manual data entry 
across 3 separate systems, taking an average of 45 minutes per customer."
```

### Dependencies Documentation

- Create this document after the tech stack is defined
- Automatically extract dependencies from package files when available
- Research each dependency to provide accurate documentation links and descriptions
- Document both current and required versions, noting compatibility constraints

Example approach:
```
When documenting dependencies, follow this process:

1. Extract dependencies from package files (package.json, requirements.txt, etc.)
2. For each dependency:
   a. Search for the official documentation site and GitHub repository
   b. Extract the current version from the project and identify the latest available version
   c. Pull a concise description from the official documentation
   d. Note any version constraints or compatibility issues
   e. Add project-specific implementation details if available

For JavaScript projects, extract dependencies with:
`npm list --depth=0` or by examining package.json
For Python: `pip freeze` or examining requirements.txt
For Rust: Examine Cargo.toml and run `cargo tree`

When multiple related dependencies exist (e.g., React ecosystem libraries), 
group them logically and note their interrelationships.
```

Automation approach:
```
To automate dependency documentation:

1. Use search_files to locate package files:
   search_files(path: ".", regex: "package\\.json|requirements\\.txt|Cargo\\.toml")

2. Read each file to extract dependencies:
   read_file(path: "./package.json") // Then parse JSON to extract dependencies

3. For each dependency, search for documentation:
   - Use the brave_web_search tool to search for "[dependency name] documentation"
   - Look for official sites, GitHub repositories, and package registries
   - Extract version information, description, and documentation URLs

4. Populate the dependencies documentation template with the gathered information
```

### Features Specification

- Organize features hierarchically by importance
- Be specific about capabilities within each feature
- Include acceptance criteria where possible
- Clearly separate current version features from future roadmap

Example approach:
```
When documenting features, start with the core feature that provides the 
main value proposition. For each feature, provide a 1-2 sentence high-level 
description followed by specific capabilities listed as bullet points. 
Each capability should be actionable and testable. For example, instead of 
"User management capabilities," specify "User role assignment with granular 
permissions at both group and individual levels."
```

### Requirements Documentation

- Separate functional requirements from technical requirements
- Group related requirements into logical categories
- Include specific metrics for performance requirements
- Ensure requirements are testable and verifiable

Example approach:
```
When documenting requirements, frame each requirement as a specific capability 
the system must provide, not as a feature or task. Use "The system must..." or 
"The system shall..." formulations. Group requirements by functional area and 
ensure technical requirements include specific, measurable criteria. For example, 
"API response time must be under 200ms for 95% of requests under expected load."
```

### Tech Stack Documentation

- Focus on justification for technology choices
- Include version information for all components
- Document integrations and dependencies clearly
- Highlight security considerations for each component

Example approach:
```
When documenting the tech stack, don't just list technologies but explain 
the rationale behind each choice. For example, "React 18 with TypeScript: 
Selected for its strong type safety, extensive ecosystem, and the team's 
existing expertise. TypeScript specifically addresses our need for better 
error catching during development, reducing runtime issues."
```

### User Flow Documentation

- Start from the user's perspective, not the system
- Include all possible paths, including error scenarios
- Document decision points and conditional flows
- Consider different user types/roles where applicable

Example approach:
```
When documenting user flows, walk through the application as if you were 
a user encountering it for the first time. Document every interaction, 
screen, and decision point. Include alternate paths (what happens if the 
user makes different choices) and error paths (what happens if something 
goes wrong). Use clear, simple language focused on user actions and system 
responses.
```

### Implementation Standards

- Include real code examples that demonstrate standards
- Be specific about patterns and approaches
- Document both the "what" and "why" of standards
- Cover error handling, logging, and other cross-cutting concerns

Example approach:
```
When documenting implementation standards, provide concrete examples that 
demonstrate the recommended patterns. Explain not just how to implement 
something, but why that approach was chosen. For example, don't just specify 
"Use the repository pattern for data access" but explain "We use the repository 
pattern to abstract data access logic, making it easier to change data sources 
and simplifying unit testing by allowing data access to be mocked."
```

### Project Structure

- Document the reasoning behind the structure
- Explain naming conventions and organization principles
- Include information about configuration files
- Highlight important files and their purposes

Example approach:
```
When documenting project structure, explain the organizational principles 
behind the directory structure. Don't just describe what exists, but explain 
why it's organized that way. For example: "The components directory uses 
atomic design principles, organizing UI elements into atoms, molecules, and 
organisms. This approach improves reusability and makes it easier to locate 
and understand components based on their complexity level."
```

### Meta-Workflow Integration

- Use the XML-based function mapping to structure documentation processes
- Integrate with Windsurf memory system for continuity across sessions
- Implement the self-critique cycle for documentation improvement
- Create documentation that connects with task logs and project plans

Example approach:
```
When implementing the meta-workflow integration:

1. Start by reading the master-meta-workflow-prompt.md to understand the memory system
2. Create project-specific XML documentation function map that defines:
   - Documentation components and their associated functions
   - Documentation workflow phases and progression
   - Integration points with memory bank and task logs

3. Use the memory-aware documentation template that includes:
   - Version history and update status
   - Relationships with other memory bank components
   - Next steps and open items
   - Self-critique sections for progressive improvement

4. Implement the four-phase self-critique cycle:
   - Creator: Generate comprehensive initial documentation
   - Critic: Identify gaps, weaknesses, and assumptions
   - Defender: Address each criticism with specific improvements
   - Judge: Evaluate and score the improvements

5. Initialize the documentation function map in memory at project startup
```

Implementation example:
```
To integrate meta-workflow with documentation:

1. Create a customized DocumentationFunctionMap XML file:
   <DocumentationFunctionMap version="1.0">
     <DocumentationFunctions>
       <Component id="ProjectOverview">
         <Function id="createProjectBrief">...</Function>
         ...
       </Component>
       ...
     </DocumentationFunctions>
     ...
   </DocumentationFunctionMap>

2. Initialize documentation memory at project start:
   - Check if documentation exists
   - Create or load documentation structure
   - Load function map into memory
   - Create associations between functions and components

3. Use memory-aware templates for all documentation
   # [Document Type] - [Project Name]
   
   **Last Updated:** [Date]
   **Memory Bank Status:** [Status]
   
   ## Memory Context
   - **Informs:** [Related docs]
   - **Informed by:** [Source docs]
   
   ## [Content following template]
   
   ## Next Steps
   1. [Next step 1]
   2. [Next step 2]

4. Record documentation updates in task logs
```

## Adapting for Different Project Types

### Frontend Applications

- Emphasize user flows and UI component documentation
- Include details on state management approaches
- Document responsive design considerations
- Focus on performance optimization strategies

### Backend Services

- Detail API contracts and documentation
- Focus on data models and database schema
- Document authentication and authorization mechanisms
- Emphasize scalability and reliability approaches

### Full-Stack Applications

- Clearly separate frontend and backend documentation
- Document data flow between layers
- Include deployment architecture diagrams
- Detail integration points and contract specifications

### Mobile Applications

- Include platform-specific considerations
- Document offline capabilities and synchronization
- Detail push notification strategies
- Include app store deployment information

## Common Documentation Pitfalls to Avoid

1. **Vague Language**
   - Avoid: "The system should be fast"
   - Better: "API responses must complete within 200ms at P95"

2. **Focusing on Implementation Over Intent**
   - Avoid: "The system uses PostgreSQL database"
   - Better: "The system requires a relational database with strong ACID compliance to ensure data integrity; PostgreSQL was selected because..."

3. **Neglecting Error Scenarios**
   - Avoid documenting only the happy path
   - Include error handling, edge cases, and recovery processes

4. **Inconsistent Terminology**
   - Establish a glossary for project-specific terms
   - Use the same terms consistently across all documents

5. **Outdated Information**
   - Note when documentation was last updated
   - Flag sections that may need revision as the project evolves

## Documentation Maintenance

Advise users to:

1. Update documentation as part of the development process
2. Review documentation during sprint reviews/retrospectives
3. Assign documentation ownership to team members
4. Include documentation updates in definition of done
5. Schedule regular documentation audits

## Final Tips for AI Models

- Use these templates as structured guides, not rigid constraints
- Adapt the level of detail based on the project's size and complexity
- Ask clarifying questions when information is missing
- Suggest visualization opportunities (diagrams, flowcharts) where helpful
- Remember that good documentation prioritizes reader understanding over exhaustive detail
