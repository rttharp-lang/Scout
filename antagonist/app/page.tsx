import SmoothScroll from "@/components/system/SmoothScroll";
import SoundSystem from "@/components/system/SoundSystem";
import Chrome from "@/components/system/Chrome";
import Act00Tunnel from "@/components/acts/Act00Tunnel";
import Act01Reaction from "@/components/acts/Act01Reaction";
import Act02Antagonist from "@/components/acts/Act02Antagonist";
import Act03RageBait from "@/components/acts/Act03RageBait";
import Act04Codes from "@/components/acts/Act04Codes";
import Act05Product from "@/components/acts/Act05Product";
import Act06Worlds from "@/components/acts/Act06Worlds";
import Act07Exit from "@/components/acts/Act07Exit";

/**
 * The experience is a sequence of acts. Order and identity come from
 * content/season.ts `chapters`; each act component owns its own motion.
 */
export default function Page() {
  return (
    <SoundSystem>
      <SmoothScroll>
        <Chrome />
        <main>
          <Act00Tunnel />
          <Act01Reaction />
          <Act02Antagonist />
          <Act03RageBait />
          <Act04Codes />
          <Act05Product />
          <Act06Worlds />
          <Act07Exit />
        </main>
      </SmoothScroll>
    </SoundSystem>
  );
}
