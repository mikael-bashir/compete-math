"use client";

// import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import { customKatexOptions } from "@/app/lib/constants/archives/problems";
import SimpleFrame from "@/app/lib/components/problems/frames";
import { useForm } from "react-hook-form";
import { answer } from "@/app/lib/types/problems";

export default function ProblemPage() {
  // const { problem } = useParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { register, handleSubmit } = useForm<answer>({
		mode: 'onSubmit',
		defaultValues: {
			answer: "",
		},
	});

  const problemStatement = `
<div class="font-sans">
<h2 class="text-center text-[18pt] mb-4">Plastic Balls</h2>
<p>You are given a unit height and $m$ plastic balls. Dropping a ball from a height greater than some unknown, fixed height $h$ always breaks it, and dropping lower than the height $h$ never breaks it, where $0 < h < 1$.</p>
<p class="mt-5">Additional information:</p>
<ul>
  <li>- $s(n, m)$ is the smallest interval size you can guarantee for $h$, by continously dropping balls until you use up your $n$ drops, or break all of your $m$ balls (whichever occurs first)</li>
  <li>- Balls can be re-used if they are not broken</li>
  <li>- You are allowed a maximum of $n$ drops across all $m$ balls</li>
</ul>
<p class="mt-5">Calculate the value of $\\frac{1}{s(31, 4)}$</p>
</div>
  `;

  // const problemStatement = `
{/* <h2>Unit Square Strings</h2>
<p>Two points are chosen uniformly at random from the interior of a unit square.</p>
<p>A string is stretched between the two points. What is the probability that the string is shorter than a unit?</p>
<p>Give your answer to 10 decimal places, multiplied by $10^{10}$.</p> */}
  // `;

  // const problemStatement = `
{/* <h2>Glass Marbles</h2>
<p>You are given a height of 1 unit and $m$ plastic balls. Dropping a ball from a height greater than some unknown, fixed height $h$ always breaks the ball, and dropping lower than the height $h$ never breaks the ball, where $0 < h < 1$.</p>
<p>Definitions:</p>
<ul>
  <li>$s(n, m)$: The smallest interval size you can guarantee for $h$ with $n$ drops and $m$ balls</li>
  <li>Balls can be re-used if they are not broken</li>
  <li>You are allowed a maximum of $n$ drops across all $m$ balls</li>
</ul>
<p>Question: Calculate $\dfrac{1}{s(3141, 592)} \mod 653589793$</p> */}
  // `;

  // const problemStatement = `
{/* <h2>Perfect Cannoli</h2>
<p>The perfect cannoli recipe:</p>
<ol>
  <li>Start with a unit circle shell, perfectly thin (negligible thickness)</li>
  <li>Wrap the shell around a smooth cylinder with base radius $\dfrac{1}{\pi}$</li>
  <li>Fry the shell in oil that doesn't alter dimensions</li>
  <li>Fill with filling that perfectly fills all enclosing spaces</li>
  <li>Scrape off excess with a straight card moving perpendicularly across the top</li>
</ol>
<p>Question: What is the volume of the filling?<br> 
Give volume to 10 decimal places, multiplied by $10^{10}$.</p> */}
  // `;

    // const onSubmit = async (formData: answer) => {
    const onSubmit = async () => {
        // const response = await fetch("api/problems/check-answer", {
        //     	method: 'POST',
				// headers: { 'Content-Type': 'application/json' },
				// body: JSON.stringify({ answer: formData.answer }),
        // })
        console.log('you are not supposed to see this');
    }

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        // if (!isMounted || !containerRef.current) return;

        // 1. Sanitize HTML
        const cleanHTML = DOMPurify.sanitize(problemStatement);
        containerRef.current.innerHTML = cleanHTML;

        // 2. Render math expressions with delay
        setTimeout(() => {
        if (containerRef.current) {
            renderMathInElement(containerRef.current, customKatexOptions);
        }
        }, 50);
    }, [isMounted, problemStatement]);

    const Problem = () => (
        <div className="flex flex-col">
            <div ref={containerRef} className="problem-content" />
            <input 
                {...register('answer', { required: true })}
                className="text-black mx-auto w-32 rounded mt-20"
                onSubmit={handleSubmit(onSubmit)}
            />
        </div>
    );

    if (!isMounted) {
        return (
        <div className="p-4 text-center text-gray-500">
            Loading math content...
        </div>
        );
    }

    return (
        <div className="mt-20 pl-10 pr-10">
            <SimpleFrame Component={Problem}/>
        </div>
    );
}