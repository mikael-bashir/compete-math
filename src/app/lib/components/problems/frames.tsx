import { ComponentType } from "react"

export default function SimpleFrame({ Component } : { Component: ComponentType }) {
    return(
        <div className="relative rounded-xl border border-gray-300 shadow-lg p-6 max-w-2xl mx-auto my-8 text-black bg-yellow-50">
            <Component />
        </div>
    )
}
