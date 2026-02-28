import React from "react";
import Link from "next/link";

export type ButtonVariant = "purple" | "blue" | "dark";

export type CustomButtonProps = {
    children: React.ReactNode;
    className?: string;
    variant?: ButtonVariant;
    onClick?: () => void;
    href?: string;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    "aria-label"?: string;
};

// Componente de Botão Estilizado (Neon/Glass)
export const CustomButton = ({
    children,
    onClick,
    className = "",
    variant = "purple",
    href,
    type = "button",
    disabled,
    ...rest
}: CustomButtonProps) => {
    const gradients: Record<ButtonVariant, string> = {
        purple:
            "from-indigo-600 via-purple-600 to-fuchsia-600 hover:shadow-[0_0_70px_-12px_#a855f7] shadow-[0_0_50px_-12px_#a855f7]",
        blue:
            "from-blue-600 via-cyan-600 to-blue-500 hover:shadow-[0_0_70px_-12px_#3b82f6] shadow-[0_0_50px_-12px_#3b82f6]",
        dark:
            "from-gray-800 via-gray-900 to-black hover:shadow-[0_0_70px_-12px_#000000] shadow-[0_0_40px_-12px_#000000]",
    };

    const baseClass = `group z-10 flex gap-2 overflow-hidden transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] text-lg font-semibold text-white h-14 ring-white/20 ring-1 rounded-full px-10 relative items-center justify-center ${gradients[variant]
        } ${className} ${disabled ? "opacity-60 pointer-events-none" : ""}`;

    const inner = (
        <>
            <div
                className={`absolute inset-0 bg-gradient-to-r ${gradients[variant].split(" ")[0]} ${gradients[variant].split(" ")[1]
                    } ${gradients[variant].split(" ")[2]} opacity-80 transition-opacity duration-300 group-hover:opacity-100`}
            ></div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent_50%)] mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.2),transparent_50%)] mix-blend-overlay"></div>
            <div className="transition-all duration-300 group-hover:border-white/70 group-hover:shadow-[inset_0_0_20px_rgba(255,255,255,0.7)] border-white/50 border rounded-full absolute top-0 right-0 bottom-0 left-0 shadow-[inset_0_0_15px_rgba(255,255,255,0.5)]"></div>
            <span className="relative z-10 flex items-center gap-2 drop-shadow-md leading-none whitespace-nowrap">
                {children}
            </span>
        </>
    );

    if (href) {
        return (
            <Link href={href} className={baseClass} {...rest}>
                {inner}
            </Link>
        );
    }

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={baseClass}
            {...rest}
        >
            {inner}
        </button>
    );
};
