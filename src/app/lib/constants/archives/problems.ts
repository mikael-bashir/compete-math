import type { RenderMathInElementOptions } from "katex/contrib/auto-render";


export const problems = [
    { id: "001", name: "Plastic Balls", url: "/problems/plastic-balls" },
    { id: "002", name: "coming soon!", url: "/problems/2" },
    { id: "003", name: "coming soon!", url: "/problems/3" },
    { id: "004", name: "coming soon!", url: "/problems/4" },
    { id: "005", name: "coming soon!", url: "/problems/5" },
    { id: "006", name: "coming soon!", url: "/problems/6" },
    { id: "007", name: "coming soon!", url: "/problems/7" },
    { id: "008", name: "coming soon!", url: "/problems/8" },
    { id: "009", name: "coming soon!", url: "/problems/9" },
    { id: "010", name: "coming soon!", url: "/problems/10" },
    { id: "011", name: "coming soon!", url: "/problems/11" },
    { id: "012", name: "coming soon!", url: "/problems/12" },
    { id: "013", name: "coming soon!", url: "/problems/13" },
    { id: "014", name: "coming soon!", url: "/problems/14" },
    { id: "015", name: "coming soon!", url: "/problems/15" },
    { id: "016", name: "coming soon!", url: "/problems/16" },
    { id: "017", name: "coming soon!", url: "/problems/17" },
    { id: "018", name: "coming soon!", url: "/problems/18" },
    { id: "019", name: "coming soon!", url: "/problems/19" },
    { id: "020", name: "Unit Square String", url: "/problems/unit-square-string" },
    { id: "021", name: "coming soon!", url: "/problems/21" },
    { id: "022", name: "coming soon!", url: "/problems/22" },
    { id: "023", name: "coming soon!", url: "/problems/23" },
    { id: "024", name: "coming soon!", url: "/problems/24" },
    { id: "025", name: "coming soon!", url: "/problems/25" },
    { id: "026", name: "coming soon!", url: "/problems/26" },
    { id: "027", name: "coming soon!", url: "/problems/27" },
    { id: "028", name: "Glass Marbles", url: "/problems/glass-marbles" },
    { id: "029", name: "coming soon!", url: "/problems/29" },
    { id: "030", name: "coming soon!", url: "/problems/30" },
    { id: "031", name: "coming soon!", url: "/problems/31" },
    { id: "032", name: "coming soon!", url: "/problems/32" },
    { id: "033", name: "coming soon!", url: "/problems/33" },
    { id: "034", name: "coming soon!", url: "/problems/34" },
    { id: "035", name: "Perfect Cannoli", url: "/problems/perfect-cannoli" }
];

export const customKatexOptions : RenderMathInElementOptions = 
{
    delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
    ignoredTags: ["script", "noscript", "style", "textarea", "pre"],
    errorColor: "#cc0000",
}
