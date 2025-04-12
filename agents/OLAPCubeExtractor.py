import json
from crewai import Agent, Task, Crew
from langchain_openai import ChatOpenAI

class OLAPCubeExtractor:
    def __init__(self):
        # Set up LLM
        llm = ChatOpenAI(model="gpt-4o-mini")
        self.agent = Agent(
            role="Senior Data Analyst",
            goal="Extract OLAP cubes from a given DB schema JSON",
            backstory="Expert in designing and extracting OLAP cubes from normalized or denormalized schemas.",
            verbose=True,
            allow_delegation=False,
            tools=[],
            llm=llm,
            instructions="""
You are a senior data analyst with expertise in designing and extracting OLAP cubes from database schemas. Your task is to analyze the provided database schema and extract the necessary components to define an OLAP cube. The schema is provided as a dictionary.

Your output must be a JSON object with the following structure:
[
  {
    "name": "name of the cube",
    "describe": "brief description of the cube",
    "dimensions": ["list of dimension fields"],
    "measures": ["list of measure fields"],
    "sql_query": "valid SQL view representing the cube"
  }
]

Guidelines:
- Ensure the SQL is syntactically correct.
- Use SELECT ... FROM ... JOIN ... WHERE patterns if necessary.
- Use GROUP BY for aggregation in measures.
- Identify primary/foreign key relationships if needed from the schema structure.
"""
        )

    def run(self, schema: dict):
        task_description = f"""
## instructions :
- make sure that the sql is correct

## format returned should be :
{{
"name":"...",
"describe":"...",
"dimensions":[..],
"measures":[..],
"sql_query":"..."
}}

return a valide list of OLAP cubes

# SCHEMA
for this schema extract the cubes OLAP :
{json.dumps(schema)}
"""
        task = Task(
            description=task_description,
            agent=self.agent,
            expected_output="A valid JSON list of OLAP cubes"
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            verbose=True
        )
        result = crew.kickoff()
        return result
