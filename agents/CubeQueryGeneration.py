import json
from crewai import Agent, Task, Crew
from langchain_openai import ChatOpenAI


class CubeQueryGeneration:
    def __init__(self, cube):
        self.cube = cube
        llm = ChatOpenAI(model="gpt-4o-mini")
        self.agent = Agent(
            role="OLAP Query Generator",
            goal="Generate a new SQL query based on a user question and a given OLAP cube definition.",
            backstory=(
                "You are an expert data analyst specialized in translating business questions into SQL queries "
                "based on predefined OLAP cube definitions. You work with analysts who give you high-level questions "
                "like 'show sales by month', and you respond with valid SQL queries using cube metadata and logic."
                "notes:"
                " - we are used SQLITE3 syntax."
                " - if user requests a multi raws data , just show limit of 20."
            ),
            verbose=True,
            allow_delegation=False,
            tools=[],
            llm=llm,
            instructions="""
You are given an OLAP cube in JSON format and a user query in natural language.

Your task is to:
- Understand the dimensions and measures available in the cube.
- Use the original SQL query from the cube as a structural guide.
- Rewrite or generate a **new SQL query** that answers the user’s question using only available cube fields.
- Maintain SQL correctness and proper GROUP BY usage when necessary.
- Do not add columns or joins that are not part of the original cube.

You will return ONLY the final SQL query.

Input JSON cube and user query will be provided together in the task.
""",
        )

    def run(self, user_question: str):
        task_description = f"""
You are given the following OLAP cube definition:

{json.dumps(self.cube, indent=2)}

And the user question:

"{user_question}"

Generate a valid SQL query to answer the question using only available dimensions and measures from the cube.
"""
        task = Task(
            description=task_description,
            agent=self.agent,
            expected_output="SQL query string only",
        )

        crew = Crew(agents=[self.agent], tasks=[task], verbose=True)

        result = crew.kickoff()
        return result
