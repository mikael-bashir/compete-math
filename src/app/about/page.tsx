// app/about/page.tsx

import Link from 'next/link';

const About = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-4xl font-semibold text-center text-gray-800">
        The purpose of Compete Math
      </h1>
      <p className="text-lg text-gray-600">
        The main reason Compete Math exists is to share some interesting problems I found during my studies of Mathematics. The sharing of creative solutions and competition to create more efficient algorithms is encouraged.
      </p>
      <p className="text-lg text-gray-600">
        The problems are intended to be solved with a machine, to prevent guessing the solution. Therefore, the crux of the problem can be solved with pen and paper, although some coding can help to see patterns and test hypotheses.
      </p>
      <p className="text-lg text-gray-600">
        The creation of Compete Math is inspired by{' '}
        <a
          id="ProjectEuler"
          href="https://projecteuler.net/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          Project Euler
        </a>
        , but none of the problems are.
      </p>

      <h2 className="text-3xl font-semibold text-gray-800">Who are the problems aimed at?</h2>
      <p className="text-lg text-gray-600">
        No problem requires advanced theory, so a curious high-schooler, all the way to an expert, will find problems that are rewarding and challenging to them. So, there isn't a strict target audience, and all of the challenges can be solved with some creativity and investigation.
      </p>
      <p className="text-lg text-gray-600">
        It should be noted, these problems resemble closest, the theme of competition mathematics. Further, an efficient algorithm shouldn't take more than 1 second to run, and past the 1-minute mark is considered slow.
      </p>
      <p className="text-lg text-gray-600">
        The problems are in a rough ordering by difficulty level, so it is recommended to start with the first few problems. Whatever you do, the key is to have fun and do interesting maths!
      </p>

      <h5 className="text-2xl font-medium text-gray-800">I've been rate-limited - what to do?</h5>
      <p className="text-lg text-gray-600">
        Don't worry - if our systems have detected unusual activity, then you can submit answers at the usual rate of 10 seconds per question, a day after the last offense. You can prevent unusual activity by doing minimal guessing, and submitting answers only when you are confident.
      </p>

      <h3 className="text-3xl font-semibold text-gray-800">How to get started</h3>
      <p className="text-lg text-gray-600">
        Signing up is completely free for anyone - you can get started by clicking the{' '}
        <Link id="registerLink" href="/auth/register" className="text-blue-500 hover:underline">
          Register
        </Link>{' '}
        button in the navigation and creating an account. Then, you can{' '}
        <Link id="loginLink" href="/auth/login" className="text-blue-500 hover:underline">
          Login
        </Link>{' '}
        - that way, your progress will be saved and you can submit answers to questions.
      </p>
      <p className="text-lg text-gray-600">
        Feel free, however, to just view the problems instead - you can find them in{' '}
        <Link id="archivesLink" href="/archives" className="text-blue-500 hover:underline">
          Archives
        </Link>{' '}
        in the navigation.
      </p>
      <p className="text-lg text-gray-600">
        If you want to share a problem, or have any feedback, feel free to drop a message to the email below.
      </p>

      <h4 className="text-2xl font-medium text-gray-800">
        Puzzling Mind:{' '}
        <a href="mailto:PuzzlingMinds@outlook.com" className="text-blue-500 hover:underline">
          PuzzlingMinds@outlook.com
        </a>
      </h4>
    </div>
  );
};

export default About;
