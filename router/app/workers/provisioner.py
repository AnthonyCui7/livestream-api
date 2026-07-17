"""Spin up (and tear down) the per-project EC2 workers that run the clip container.

This is the router's core job: translate a clip request into a running worker.
Each project gets its own instance, launched with a bootstrap that runs the
container and then terminates the instance when the job finishes.

The public surface is deliberately small so an ECS/Fargate implementation
could be swapped in later behind the same three functions.
"""

import logging

from app.aws import get_ec2_client
from app.config import Settings, get_settings
from app.workers.user_data import build_worker_user_data

logger = logging.getLogger(__name__)


def launch_worker(
    *,
    project_id: str,
    source_url: str,
    source_type: str,
    settings: Settings | None = None,
) -> str:
    """Launch an EC2 worker for a project. Returns the new instance id.

    Raises ValueError if the worker AMI or container image isn't configured.
    """
    settings = settings or get_settings()

    if not settings.worker_ami_id:
        raise ValueError("WORKER_AMI_ID is not set — cannot launch a worker.")
    if not settings.worker_image_uri:
        raise ValueError("WORKER_IMAGE_URI is not set — the worker has no container to run.")

    user_data = build_worker_user_data(
        settings,
        project_id=project_id,
        source_url=source_url,
        source_type=source_type,
    )

    kwargs: dict = {
        "ImageId": settings.worker_ami_id,
        "InstanceType": settings.worker_instance_type,
        "MinCount": 1,
        "MaxCount": 1,
        "UserData": user_data,
        # Ends the instance's life when the bootstrap runs `shutdown -h now`.
        "InstanceInitiatedShutdownBehavior": "terminate",
        "BlockDeviceMappings": [
            {
                "DeviceName": "/dev/xvda",  # AL2023 root device
                "Ebs": {
                    "VolumeSize": settings.worker_ebs_volume_size_gb,
                    "VolumeType": "gp3",
                    "DeleteOnTermination": True,
                },
            }
        ],
        "TagSpecifications": [
            {
                "ResourceType": "instance",
                "Tags": [
                    {"Key": "Project", "Value": settings.worker_tag_project},
                    {"Key": "Role", "Value": "clip-worker"},
                    {"Key": "ProjectId", "Value": project_id},
                ],
            }
        ],
    }

    # Networking / IAM / SSH are optional; only set them when configured so
    # AWS falls back to the account defaults otherwise.
    if settings.worker_subnet_id:
        kwargs["SubnetId"] = settings.worker_subnet_id
    if settings.worker_security_group_id_list:
        kwargs["SecurityGroupIds"] = settings.worker_security_group_id_list
    if settings.worker_iam_instance_profile:
        profile = settings.worker_iam_instance_profile
        key = "Arn" if profile.startswith("arn:") else "Name"
        kwargs["IamInstanceProfile"] = {key: profile}
    if settings.worker_key_name:
        kwargs["KeyName"] = settings.worker_key_name

    resp = get_ec2_client().run_instances(**kwargs)
    instance_id = resp["Instances"][0]["InstanceId"]
    logger.info("launched clip-worker %s for project %s", instance_id, project_id)
    return instance_id


def terminate_worker(instance_id: str) -> None:
    """Terminate a worker early (e.g. job cancelled). Workers normally self-terminate."""
    get_ec2_client().terminate_instances(InstanceIds=[instance_id])
    logger.info("terminated clip-worker %s", instance_id)


def get_worker_state(instance_id: str) -> str | None:
    """Return the EC2 lifecycle state (pending/running/terminated/...) or None if gone."""
    resp = get_ec2_client().describe_instances(InstanceIds=[instance_id])
    for reservation in resp["Reservations"]:
        for instance in reservation["Instances"]:
            return instance["State"]["Name"]
    return None
